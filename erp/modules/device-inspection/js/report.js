/* ==========================================================================
   فحص الجهاز — النتيجة النهائية · التقرير القابل للطباعة · سجل الفحوصات
   ========================================================================== */
(function (global) {
  'use strict';

  var ERP = global.ERP;
  var DI = global.DI;
  var cat = DI.catalog;
  var engine = DI.engine;
  var views = DI.views;
  var el = ERP.el;

  function go(path) { DI.app.router.go(path); }

  function mount(children) {
    DI.views.cleanup();
    var app = ERP.$('#app');
    ERP.clear(app);
    ERP.append(app, children);
    global.scrollTo({ top: 0, behavior: 'auto' });
  }

  /* ======================================================================
     النتيجة النهائية
     ====================================================================== */
  views.result = function (sessionId) {
    var session = engine.load(sessionId);
    if (!session) { ERP.ui.toast('الفحص غير موجود', 'bad'); go(''); return; }
    var summary = session.summary || engine.compute(session);
    var grade = summary.grade;
    var previous = engine.deltaForDevice(session.deviceId, session.id);

    var ring = ERP.ui.ring(168, 12);
    var scoreNode = el('.score__value.mono', { text: '0' });

    var breakdown = el('.breakdown', {}, summary.breakdown.map(function (b, i) {
      var tone = b.score === null ? '' : b.score >= 85 ? 'ok' : b.score >= 65 ? 'warn' : 'bad';
      var fill = el('.bar__fill' + (tone ? '.bar__fill--' + tone : ''));
      setTimeout(function () { fill.style.width = (b.score === null ? 0 : b.score) + '%'; }, 120 + i * 60);
      return el('.breakdown__row', {}, [
        el('.breakdown__head', {}, [
          el('span.row', { style: { gap: '8px' } }, [
            el('span.breakdown__icon', { html: ERP.icon(b.icon, 16) }),
            el('span', { text: b.ar }),
            el('span.micro.mono', { text: b.en })
          ]),
          el('strong.mono', { text: b.score === null ? 'لم يُفحص' : b.score + '%' })
        ]),
        el('.bar', {}, [fill]),
        el('.micro', { text: b.counted ? (b.counted + ' اختبارات · ' + (b.failed ? b.failed + ' فاشل' : 'بلا أعطال')) : 'لا يوجد اختبار محسوب' })
      ]);
    }));

    var problems = summary.failures.length
      ? el('.stack', {}, summary.failures.map(function (f) { return problemCard(session, f); }))
      : el('.empty.card', {}, [
          el('.empty__icon', { html: ERP.icon('shield', 24), style: { color: 'var(--ok-500)' } }),
          el('strong', { text: 'لا توجد أعطال' }),
          el('p.sub', { text: 'اجتاز الجهاز كل الاختبارات المحسوبة في هذا الفحص.' })
        ]);

    mount([
      views.backBar('العودة للرئيسية', function () { go(''); }),

      el('section.result-hero.card.enter', {}, [
        el('.score', { dataset: { tone: grade.tone } }, [
          el('.score__ring', {}, [ring.node, el('.score__center', {}, [
            scoreNode,
            el('.score__max.micro', { text: 'من 100' })
          ])]),
          el('.score__meta', {}, [
            el('.badge.badge--' + grade.tone, { text: grade.ar + ' · ' + grade.en }),
            el('h1', { text: 'درجة صحة الجهاز' }),
            el('p.sub', { text: session.device.brand + ' ' + session.device.model + ' · ' + session.device.storage }),
            el('.row.wrap', { style: { marginTop: '10px' } }, [
              el('span.badge.badge--' + summary.finalStatus.tone, { text: 'الحالة النهائية: ' + summary.finalStatus.ar }),
              el('span.badge', { text: 'التغطية ' + summary.coverage + '%' }),
              summary.capped ? el('span.badge.badge--warn', { text: 'مقيّدة بعطل أساسي' }) : null,
              previous ? el('span.badge' + (summary.score >= previous.score ? '.badge--ok' : '.badge--bad'), {
                text: (summary.score >= previous.score ? '▲ ' : '▼ ') + Math.abs(summary.score - previous.score) + ' عن فحص ' + ERP.fmt.dateShort(previous.at)
              }) : null
            ])
          ])
        ]),
        el('.result-hero__facts', {}, [
          fact('الفاحص', session.inspectorName || '—'),
          fact('التاريخ', ERP.fmt.date(session.finishedAt || session.startedAt)),
          fact('الوقت', ERP.fmt.time(session.finishedAt || session.startedAt)),
          fact('مدة الفحص', ERP.fmt.duration(session.durationMs || (session.finishedAt - session.startedAt))),
          fact('IMEI', ERP.fmt.imei(session.device.imei) || '—'),
          fact('Serial', session.device.serial || '—')
        ])
      ]),

      el('.cols.enter.enter-1', {}, [
        el('section.card', {}, [
          el('h2.section-title', { text: 'تفصيل الدرجة' }),
          el('p.sub', { text: 'وزن كل مجموعة يعتمد على أهمية اختباراتها.' }),
          breakdown
        ]),
        el('section', {}, [
          el('.row-between', { style: { marginBottom: '10px' } }, [
            el('h2.section-title', { text: 'الأعطال' }),
            summary.failures.length ? el('span.badge.badge--bad', { text: summary.failures.length + ' عطل' }) : null
          ]),
          problems
        ])
      ]),

      el('section.card.enter.enter-2', {}, [
        el('h2.section-title', { text: 'ملاحظات عامة' }),
        el('p.sub', { text: 'تُطبع في نهاية تقرير الفحص — مثل: حالة الهيكل، الملحقات المرفقة، أو الاتفاق مع الزبون.' }),
        generalNotes(session)
      ]),

      el('.result-actions.glass.enter.enter-3', {}, [
        el('button.btn.btn--primary', {
          type: 'button', html: ERP.icon('doc', 17) + '<span>عرض التقرير</span>',
          onclick: function () { go('report/' + session.id); }
        }),
        el('button.btn.btn--ghost', {
          type: 'button', html: ERP.icon('print', 17) + '<span>طباعة</span>',
          onclick: function () { location.hash = '#/report/' + session.id; setTimeout(ERP.ui.print, 350); }
        }),
        el('button.btn.btn--ghost', {
          type: 'button', html: ERP.icon('history', 17) + '<span>سجل الجهاز</span>',
          onclick: function () { go('history/' + session.deviceId); }
        }),
        el('button.btn.btn--ghost', {
          type: 'button', html: ERP.icon('plus', 17) + '<span>فحص جديد</span>',
          onclick: function () { go(''); }
        })
      ])
    ]);

    ring.set(0);
    requestAnimationFrame(function () {
      ring.set(summary.score, grade.tone === 'ok' ? 'ok' : grade.tone === 'warn' ? 'warn' : 'bad');
      ERP.ui.countUp(scoreNode, summary.score, { duration: 1100 });
    });
  };

  function generalNotes(session) {
    var box = el('textarea.textarea', { rows: '3', placeholder: 'اكتب ملاحظاتك العامة هنا…', style: { marginBlockStart: '12px' } });
    box.value = session.generalNotes || '';
    box.addEventListener('input', ERP.debounce(function () {
      var fresh = engine.load(session.id) || session;
      fresh.generalNotes = box.value.trim();
      engine.save(fresh);
    }, 500));
    return box;
  }

  function fact(k, v) {
    return el('.fact', {}, [el('.fact__k', { text: k }), el('.fact__v' + (/IMEI|Serial/.test(k) ? '.mono' : ''), { text: v })]);
  }

  function problemCard(session, failure) {
    var notes = el('textarea.textarea', { rows: '2', placeholder: 'أضف ملاحظة توضّح العطل أو الإصلاح المطلوب…' });
    notes.value = failure.notes || '';
    notes.addEventListener('input', ERP.debounce(function () {
      engine.setNotes(session, failure.testId, notes.value.trim());
      var s = engine.load(session.id);
      if (s && s.summary) {
        s.summary.failures.forEach(function (f) { if (f.testId === failure.testId) f.notes = notes.value.trim(); });
        engine.save(s);
      }
      ERP.ui.toast('حُفظت الملاحظة', 'ok', 1400);
    }, 600));

    return el('article.problem.card.card--pad-sm', {}, [
      el('.row-between', {}, [
        el('.row', { style: { gap: '10px' } }, [
          el('.problem__icon', { html: ERP.icon('alert', 18) }),
          el('div', {}, [
            el('strong', { text: failure.ar + ' — فاشل' }),
            el('.micro.mono', { text: failure.en + ' · ' + failure.stageAr })
          ])
        ]),
        failure.critical ? el('span.badge.badge--bad', { text: 'عطل أساسي' }) : null
      ]),
      failure.metrics ? el('.row.wrap', { style: { marginTop: '8px' } }, Object.keys(failure.metrics).map(function (k) {
        return el('span.metric.mono', { text: k + ': ' + failure.metrics[k] });
      })) : null,
      notes
    ]);
  }

  /* ======================================================================
     التقرير القابل للطباعة
     ====================================================================== */
  views.report = function (sessionId) {
    var session = engine.load(sessionId);
    if (!session) { ERP.ui.toast('التقرير غير موجود', 'bad'); go(''); return; }
    var summary = session.summary || engine.compute(session);
    var customer = session.customerId ? ERP.customers.get(session.customerId) : null;
    var purpose = cat.PURPOSES.filter(function (p) { return p.id === session.purpose; })[0];

    var rows = [];
    cat.STAGES.forEach(function (stage) {
      var tests = cat.stageTests(stage.id).filter(function (t) {
        var r = session.results[t.id];
        return r && r.status;
      });
      if (!tests.length) return;
      rows.push(el('tr.rep-table__stage', {}, [el('th', { colspan: '3', text: stage.n + '. ' + stage.ar + ' — ' + stage.en })]));
      tests.forEach(function (t) {
        var r = session.results[t.id];
        var meta = cat.STATUS_META[r.status];
        var detail = [];
        if (r.notes) detail.push(r.notes);
        if (r.reason) detail.push(r.reason);
        if (r.metrics) {
          detail.push(Object.keys(r.metrics).filter(function (k) {
            return r.metrics[k] !== null && r.metrics[k] !== undefined && r.metrics[k] !== false;
          }).map(function (k) { return k + '=' + r.metrics[k]; }).join(' · '));
        }
        rows.push(el('tr', {}, [
          el('td', {}, [el('div', { text: t.ar }), el('.micro.mono', { text: t.en })]),
          el('td', {}, [el('span.rep-status', { dataset: { tone: meta.tone }, text: meta.ar + ' / ' + meta.en })]),
          el('td.rep-detail', { text: detail.filter(Boolean).join(' — ') || '—' })
        ]));
      });
    });

    mount([
      el('.report-toolbar.no-print', {}, [
        el('button.btn.btn--quiet.btn--sm', {
          type: 'button', html: ERP.icon('back', 16) + '<span>رجوع</span>',
          onclick: function () { go('result/' + session.id); }
        }),
        el('.row.wrap', {}, [
          el('button.btn.btn--ghost.btn--sm', {
            type: 'button', html: ERP.icon('history', 15) + '<span>سجل الجهاز</span>',
            onclick: function () { go('history/' + session.deviceId); }
          }),
          el('button.btn.btn--primary.btn--sm', {
            type: 'button', html: ERP.icon('print', 15) + '<span>طباعة التقرير</span>',
            onclick: ERP.ui.print
          })
        ])
      ]),

      el('article.report', {}, [
        el('header.report__head', {}, [
          el('div', {}, [
            el('.report__brand', { text: 'مركز سفيان للهواتف' }),
            el('.report__sub', { text: 'صلاح الدين — سامراء — الحويش' })
          ]),
          el('div.report__title', {}, [
            el('h1', { text: 'تقرير فحص جهاز' }),
            el('.mono.micro', { text: 'Device Inspection Report' }),
            el('.mono.micro', { text: 'رقم التقرير: ' + session.id.toUpperCase().slice(-10) })
          ])
        ]),

        el('section.report__grid', {}, [
          reportBlock('بيانات الجهاز — Device', [
            ['Brand', session.device.brand],
            ['Model', session.device.model],
            ['Variant', session.device.variant],
            ['Storage', session.device.storage],
            ['Color', session.device.color],
            ['OS Version', session.device.osVersion]
          ]),
          reportBlock('التعريف — Identifiers', [
            ['IMEI', ERP.fmt.imei(session.device.imei) || '—'],
            ['IMEI 2', session.device.imei2 ? ERP.fmt.imei(session.device.imei2) : '—'],
            ['Serial', session.device.serial || '—']
          ]),
          reportBlock('الفحص — Inspection', [
            ['Inspector', session.inspectorName || '—'],
            ['Date', ERP.fmt.date(session.finishedAt || session.startedAt)],
            ['Time', ERP.fmt.time(session.finishedAt || session.startedAt)],
            ['Duration', ERP.fmt.duration(session.durationMs || 0)],
            ['Purpose', purpose ? purpose.ar + ' / ' + purpose.en : '—'],
            ['Customer', customer ? customer.name + (customer.phone ? ' — ' + customer.phone : '') : '—']
          ])
        ]),

        el('section.report__score', {}, [
          el('.report__score-main', {}, [
            el('.report__score-value.mono', { text: summary.score + ' / 100' }),
            el('.report__score-grade', { text: summary.grade.ar + ' · ' + summary.grade.en })
          ]),
          el('.report__score-side', {}, [
            el('.report__status', { dataset: { tone: summary.finalStatus.tone }, text: 'Final Status: ' + summary.finalStatus.ar + ' / ' + summary.finalStatus.en }),
            el('.micro', { text: 'التغطية: ' + summary.coverage + '% · اختبارات محسوبة: ' + summary.counted + ' · أعطال: ' + summary.failures.length + (summary.criticalFails ? ' (منها ' + summary.criticalFails + ' أساسي)' : '') })
          ])
        ]),

        el('section.report__breakdown', {}, summary.breakdown.map(function (b) {
          return el('.report__cat', {}, [
            el('.micro', { text: b.ar + ' / ' + b.en }),
            el('strong.mono', { text: b.score === null ? '—' : b.score + '%' })
          ]);
        })),

        summary.failures.length ? el('section.report__failures', {}, [
          el('h2', { text: 'الأعطال — Failures' }),
          el('ol', {}, summary.failures.map(function (f) {
            return el('li', {}, [
              el('strong', { text: f.ar + ' (' + f.en + ')' + (f.critical ? ' — عطل أساسي' : '') }),
              f.notes ? el('.micro', { text: f.notes }) : null
            ]);
          }))
        ]) : null,

        el('section', {}, [
          el('h2', { text: 'نتائج الاختبارات — Test Results' }),
          el('.table-wrap', {}, [
            el('table.tbl.rep-table', {}, [
              el('thead', {}, [el('tr', {}, [
                el('th', { text: 'الاختبار' }), el('th', { text: 'النتيجة' }), el('th', { text: 'التفاصيل' })
              ])]),
              el('tbody', {}, rows)
            ])
          ])
        ]),

        session.generalNotes ? el('section', {}, [
          el('h2', { text: 'ملاحظات عامة' }),
          el('p', { text: session.generalNotes })
        ]) : null,

        el('footer.report__foot', {}, [
          el('.report__sign', {}, [el('.micro', { text: 'توقيع الفاحص' }), el('.report__line')]),
          el('.report__sign', {}, [el('.micro', { text: 'توقيع الزبون / المستلم' }), el('.report__line')]),
          el('.micro', { text: 'صدر آليًا من نظام فحص الجهاز — Soufyan ERP · ' + ERP.fmt.dateTime(Date.now()) })
        ])
      ])
    ]);
  };

  function reportBlock(title, pairs) {
    return el('.report__block', {}, [
      el('h3', { text: title }),
      el('dl', {}, pairs.map(function (p) {
        return el('.report__pair', {}, [
          el('dt', { text: p[0] }),
          el('dd' + (/IMEI|Serial/.test(p[0]) ? '.mono' : ''), { text: p[1] || '—' })
        ]);
      }))
    ]);
  }

  /* ======================================================================
     السجل
     ====================================================================== */
  views.history = function (deviceId) {
    var device = deviceId ? ERP.inventory.get(deviceId) : null;
    var listNode = el('.stack');
    var search = el('input.input', { type: 'search', placeholder: 'ابحث بالماركة أو IMEI أو اسم الفاحص…', 'aria-label': 'بحث في السجل' });

    function render(term) {
      var rows = device ? engine.listForDevice(device.id) : engine.listAll({ term: term });
      ERP.clear(listNode);
      if (!rows.length) {
        listNode.appendChild(el('.empty.card', {}, [
          el('.empty__icon', { html: ERP.icon('history', 24) }),
          el('strong', { text: 'لا توجد فحوصات بعد' }),
          el('p.sub', { text: 'ابدأ فحصًا جديدًا وسيظهر هنا مع درجته وتاريخه.' }),
          el('button.btn.btn--primary.btn--sm', { type: 'button', text: 'فحص جهاز جديد', onclick: function () { go(''); } })
        ]));
        return;
      }
      // خط زمني: 08 Sep — 94/100
      rows.forEach(function (row) {
        listNode.appendChild(el('.timeline__item', {}, [
          el('.timeline__dot', { dataset: { tone: row.summary ? row.summary.grade.tone : 'mute' } }),
          views.inspectionRow(row)
        ]));
      });
    }

    search.addEventListener('input', ERP.debounce(function () { render(search.value); }, 180));

    mount([
      views.backBar(device ? 'العودة للجهاز' : 'العودة للرئيسية', function () { go(device ? 'device/' + device.id : ''); }),
      el('section.enter', {}, [
        el('h1', { text: device ? 'سجل فحوصات الجهاز' : 'سجل الفحوصات' }),
        el('p.sub', { text: device ? device.brand + ' ' + device.model + ' · ' + (ERP.fmt.imei(device.imei) || device.serial || '') : 'كل الفحوصات المكتملة مرتّبة من الأحدث.' }),
        device ? null : el('.field', { style: { marginBlock: '16px' } }, [search]),
        el('.timeline', { style: { marginTop: '16px' } }, [listNode])
      ])
    ]);

    render('');
  };
})(window);
