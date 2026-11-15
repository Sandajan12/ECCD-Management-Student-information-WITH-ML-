package com.ameskinder.parent.nativeapp

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.uimanager.ViewManager

class NativeSessionModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "NativeSession"
  override fun getConstants(): Map<String, Any> = mapOf("baseUrl" to BuildConfig.AMES_API_URL)
  @ReactMethod fun clearCredentials(promise: Promise) {
    try { ParentHttpClientFactory.jar.clear(); promise.resolve(null) }
    catch (error: Exception) { promise.reject("SECURE_STORAGE_FAILED", "Unable to clear secure session", error) }
  }
}
class NativeSessionPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(NativeSessionModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
