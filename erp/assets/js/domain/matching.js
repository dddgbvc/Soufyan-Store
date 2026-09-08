/* ============================================================
   domain/matching.js — محرّك مطابقة المخزون بالطلبات المسبقة

   يعمل تلقائيًا عند دخول أي بضاعة إلى المخزون.
   المطابقة تعتمد على: Product · Model · Variant · Storage · Color · SKU
   ============================================================ */
(function (global) {
  'use strict';
  const ERP = (global.ERP = global.ERP || {});
  const { store, bus, util: U } = ERP;

  /** أوزان المعايير — مجموعها 100 عند التطابق الكامل */
  const WEIGHTS = {
    sku: 40,
    variant: 20,
    product: 15,
    model: 10,
    storage: 8,
    color: 7,
  };

  const CONFIDENCE = {
    EXACT:   { min: 90, label: 'تطابق تام',   tone: 'success' },
    STRONG:  { min: 70, label: 'تطابق قوي',   tone: 'success' },
    PARTIAL: { min: 0,  label: 'تطابق جزئي',  tone: 'warn' },
  };

  const matching = {
    WEIGHTS, CONFIDENCE,

    /** بناء مواصفة قابلة للمقارنة من قطعة مخزون */
    specFromStockItem(item) {
      const product = store.product(item.productId) || store.productOfVariant(item.variantId);
      const variant = store.variant(item.variantId);
      return {
        productId: item.productId || (product && product.id) || null,
        variantId: item.variantId,
        sku: item.sku || (variant && variant.sku) || null,
        model: product ? product.model : null,
        storage: variant ? variant.storage : null,
        color: variant ? variant.color : null,
      };
    },

    specFromVariant(variantId) {
      const product = store.productOfVariant(variantId);
      const variant = store.variant(variantId);
      if (!product || !variant) return null;
      return {
        productId: product.id,
        variantId: variant.id,
        sku: variant.sku,
        model: product.model,
        storage: variant.storage,
        color: variant.color,
      };
    },

    /**
     * حساب درجة التطابق بين طلب مسبق ومواصفة بضاعة.
     * @returns {{score:number, reasons:string[], confidence:string|null}}
     */
    score(order, spec) {
      const t = order.target || {};
      const reasons = [];
      let score = 0;

      const eq = (a, b) => a && b && U.norm(a) === U.norm(b);

      const skuHit = eq(t.sku, spec.sku);
      const productHit = order.productId && spec.productId && order.productId === spec.productId;

      // بوابة: لا تطابق بدون تطابق المنتج أو رمز SKU
      if (!skuHit && !productHit) return { score: 0, reasons: [], confidence: null };

      if (skuHit) { score += WEIGHTS.sku; reasons.push('SKU'); }
      if (order.variantId && spec.variantId && order.variantId === spec.variantId) {
        score += WEIGHTS.variant; reasons.push('Variant');
      }
      if (productHit) { score += WEIGHTS.product; reasons.push('المنتج'); }
      if (eq(t.model, spec.model)) { score += WEIGHTS.model; reasons.push('الموديل'); }
      if (eq(t.storage, spec.storage)) { score += WEIGHTS.storage; reasons.push('السعة'); }
      if (eq(t.color, spec.color)) { score += WEIGHTS.color; reasons.push('اللون'); }

      score = Math.min(100, score);
      let confidence = null;
      if (score >= CONFIDENCE.EXACT.min) confidence = 'EXACT';
      else if (score >= CONFIDENCE.STRONG.min) confidence = 'STRONG';
      else if (score > 0) confidence = 'PARTIAL';

      return { score, reasons, confidence };
    },

    /**
     * البحث عن الطلبات المفتوحة المطابقة لمواصفة معينة.
     * @param {object} spec
     * @param {object} opts {threshold, statuses}
     */
    find(spec, opts = {}) {
      if (!spec) return [];
      const threshold = opts.threshold !== undefined ? opts.threshold : store.settings().matchThreshold;
      const statuses = opts.statuses || ERP.preorder.MATCHABLE_STATUSES;
      const prio = ERP.preorder.PRIORITY;

      return store.preOrders()
        .filter((o) => statuses.includes(o.status))
        .map((order) => Object.assign({ order }, matching.score(order, spec)))
        .filter((m) => m.score >= threshold)
        .sort((a, b) => {
          const pa = (prio[a.order.priority] || prio.NORMAL).order;
          const pb = (prio[b.order.priority] || prio.NORMAL).order;
          if (pa !== pb) return pa - pb;                       // الأعلى أولوية أولًا
          if (b.score !== a.score) return b.score - a.score;   // ثم الأدق تطابقًا
          return new Date(a.order.createdAt) - new Date(b.order.createdAt); // ثم الأقدم
        });
    },

    /**
     * تشغيل المطابقة على قطع مخزون داخلة حديثًا.
     * يوزّع القطع المتاحة على الطلبات حسب الأولوية دون حجزها فعليًا
     * (الحجز قرار الموظف)، ويُطلق حدث PREORDER_MATCHED لكل تطابق.
     *
     * @param {Array} items قطع المخزون الداخلة
     * @param {object} opts {batchId, silent}
     * @returns {Array} قائمة التطابقات
     */
    runForStockItems(items, opts = {}) {
      const available = items.filter((it) => it.status === 'AVAILABLE');
      if (!available.length) return [];

      const results = [];
      const groups = U.groupBy(available, (it) => it.variantId);

      store.batch(() => {
        Object.keys(groups).forEach((variantId) => {
          const pool = groups[variantId].slice();
          const spec = matching.specFromStockItem(pool[0]);
          const matches = matching.find(spec);

          matches.forEach((m) => {
            if (!pool.length) return;
            const order = store.preOrder(m.order.id);
            if (!order) return;

            const take = Math.min(order.quantity, pool.length);
            const taken = pool.splice(0, take);
            const stockItemIds = taken.map((x) => x.id);
            const customer = store.customer(order.customerId);
            const at = U.nowISO();

            store.update((s) => {
              const o = s.preOrders.find((x) => x.id === order.id);
              o.matchedAt = at;
              o.suggestedStockItemIds = stockItemIds;
              o.matchInfo = { score: m.score, confidence: m.confidence, reasons: m.reasons, batchId: opts.batchId || null, at };
            });

            // نقل الطلب إلى «وصلت» تلقائيًا (قابل للإيقاف من الإعدادات)
            if (store.settings().autoAdvanceOnMatch) {
              try { ERP.preorder.markArrived(order.id, { note: 'مطابقة تلقائية عند استلام البضاعة', actor: 'النظام' }); }
              catch (err) { console.warn('[matching] auto-advance skipped', err.message); }
            }

            const payload = {
              preOrderId: order.id,
              code: order.code,
              customerId: order.customerId,
              customerName: customer ? customer.name : '',
              customerPhone: customer ? customer.phone : '',
              productName: order.target.productName,
              storage: order.target.storage,
              color: order.target.color,
              sku: order.target.sku,
              quantity: order.quantity,
              matchedQuantity: taken.length,
              stockItemIds,
              serials: taken.map((x) => x.serial).filter(Boolean),
              score: m.score,
              confidence: m.confidence,
              reasons: m.reasons,
              batchId: opts.batchId || null,
            };

            ERP.events.log('PREORDER_MATCHED', payload, 'النظام');
            bus.emit('preorder:matched', payload);
            results.push(payload);
          });
        });
      }, { reason: 'matching' });

      return results;
    },

    /**
     * عند إنشاء طلب جديد: هل البضاعة متوفرة أصلًا في المخزون؟
     * إن نعم، الطلب يصل فورًا بدل انتظار شحنة.
     */
    checkExistingStock(order) {
      const spec = matching.specFromVariant(order.variantId);
      if (!spec) return null;
      const free = ERP.inventory.availableFor(order.variantId);
      if (free.length < 1) return null;

      const take = free.slice(0, order.quantity);
      const customer = store.customer(order.customerId);
      const sc = matching.score(order, spec);
      const at = U.nowISO();

      store.update((s) => {
        const o = s.preOrders.find((x) => x.id === order.id);
        if (!o) return;
        o.matchedAt = at;
        o.suggestedStockItemIds = take.map((x) => x.id);
        o.matchInfo = { score: sc.score, confidence: sc.confidence, reasons: sc.reasons, at, source: 'existing-stock' };
      });

      if (store.settings().autoAdvanceOnMatch) {
        try { ERP.preorder.markArrived(order.id, { note: 'المنتج متوفر في المخزون حاليًا', actor: 'النظام' }); }
        catch (_) { /* تجاهل */ }
      }

      const payload = {
        preOrderId: order.id, code: order.code,
        customerId: order.customerId, customerName: customer ? customer.name : '',
        productName: order.target.productName, storage: order.target.storage,
        color: order.target.color, quantity: order.quantity,
        matchedQuantity: take.length, stockItemIds: take.map((x) => x.id),
        serials: take.map((x) => x.serial).filter(Boolean),
        score: sc.score, confidence: sc.confidence, reasons: sc.reasons,
        source: 'existing-stock',
      };
      ERP.events.log('PREORDER_MATCHED', payload, 'النظام');
      bus.emit('preorder:matched', payload);
      return payload;
    },

    /** معاينة: ما الطلبات التي ستُطابق لو دخل هذا الـ Variant؟ */
    preview(variantId, threshold) {
      const spec = matching.specFromVariant(variantId);
      return spec ? matching.find(spec, { threshold }) : [];
    },

    confidenceLabel(key) { return (CONFIDENCE[key] || {}).label || '—'; },
  };

  ERP.matching = matching;
})(window);
