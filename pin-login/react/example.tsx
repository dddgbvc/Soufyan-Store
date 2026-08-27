/* =====================================================================
   مثال استخدام PinLoginScreen داخل تطبيق نقطة البيع
   ===================================================================== */
import { useState } from "react";
import PinLoginScreen, { TechnicalBackdrop, type PinLoginResult } from "./PinLoginScreen";

export default function LoginRoute() {
  const [burst, setBurst] = useState(false);

  async function verifyPin(pin: string): Promise<PinLoginResult> {
    const response = await fetch("/api/auth/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });

    if (!response.ok) {
      // ارمِ الخطأ ليعرض المكوّن رسالة تعذّر الاتصال
      throw new Error("auth request failed");
    }

    // { success, employeeName, roleName, message? }
    return response.json();
  }

  return (
    <>
      <TechnicalBackdrop burst={burst} />
      <PinLoginScreen
        systemName="متجر صوفيان — نقطة البيع"
        minLength={4}
        maxLength={6}
        onSuccess={verifyPin}
        onVerified={() => setBurst(true)}
        onFinish={() => navigateToRegister()}
        onForgotPin={() => openSupervisorReset()}
        onPasskeyLogin={() => startPasskeyFlow()}
      />
    </>
  );
}

declare function navigateToRegister(): void;
declare function openSupervisorReset(): void;
declare function startPasskeyFlow(): void;
