import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// عنوان الخادم ومفتاح التوقيع يُمرَّران وقت البناء ولا يُحفظان في المستودع:
//   ./gradlew assembleRelease -PYQ_BASE_URL=https://... -PYQ_SIGNING=/path/key.properties
val baseUrl = (project.findProperty("YQ_BASE_URL") as String?) ?: ""
val signingProps = (project.findProperty("YQ_SIGNING") as String?)?.let { path ->
    val f = file(path)
    if (f.exists()) Properties().apply { f.inputStream().use { load(it) } }.also { it["dir"] = f.parentFile.absolutePath } else null
}

android {
    namespace = "iq.yaqoot.erp"
    compileSdk = 37

    defaultConfig {
        applicationId = "iq.sufyan.mobile"
        minSdk = 26
        targetSdk = 36
        versionCode = 3
        versionName = "1.2.0"
        buildConfigField("String", "YQ_BASE_URL", "\"$baseUrl\"")
    }

    signingConfigs {
        if (signingProps != null) {
            create("release") {
                storeFile = file("${signingProps["dir"]}/${signingProps["storeFile"]}")
                storePassword = signingProps["storePassword"] as String
                keyAlias = signingProps["keyAlias"] as String
                keyPassword = signingProps["keyPassword"] as String
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    packaging {
        resources.excludes += setOf("/META-INF/{AL2.0,LGPL2.1}", "META-INF/*.kotlin_module")
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
        optIn.addAll(
            "androidx.compose.material3.ExperimentalMaterial3Api",
            "androidx.compose.foundation.layout.ExperimentalLayoutApi",
            "androidx.compose.material3.ExperimentalMaterial3ExpressiveApi",
        )
    }
}

dependencies {
    val bom = platform("androidx.compose:compose-bom:2026.09.00")
    implementation(bom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended:1.7.8")
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.11.0")
    implementation("androidx.core:core-ktx:1.19.1")
    implementation("androidx.work:work-runtime-ktx:2.12.0")
    implementation("com.squareup.okhttp3:okhttp:5.5.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.11.0")
}
