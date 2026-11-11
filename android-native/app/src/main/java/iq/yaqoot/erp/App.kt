package iq.yaqoot.erp

import android.app.Application
import iq.yaqoot.erp.core.Notify
import iq.yaqoot.erp.core.Prefs
import iq.yaqoot.erp.core.Secure
import iq.yaqoot.erp.ui.Ui

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        Secure.init(this)
        Prefs.init(this)
        Notify.init(this)
        Ui.context = this
    }
}
