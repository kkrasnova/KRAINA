package com.kraina.app.spline

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import design.spline.runtime.SplineView

/**
 * Обгортка над [SplineView] (design.spline.runtime), як у документації Spline:
 * `SplineView(context).loadUrl("https://build.spline.design/.../scene.splinecontent")`.
 * loadUrl викликаємо після attach на UI thread через [post], щоб уникнути крашів під час лейауту RN.
 */
class SplineLowerViewManager(reactContext: ReactApplicationContext) :
  SimpleViewManager<SplineView>() {

  override fun getName(): String = NAME

  override fun createViewInstance(reactContext: ThemedReactContext): SplineView =
    SplineView(reactContext)

  @ReactProp(name = PROP_SCENE_URL)
  fun setSceneUrl(view: SplineView, url: String?) {
    val trimmed = url?.trim().orEmpty()
    if (trimmed.isEmpty()) return
    view.post {
      try {
        view.loadUrl(trimmed)
      } catch (_: Throwable) {
        // сцена / мережа / lifecycle
      }
    }
  }

  companion object {
    const val NAME = "SplineLowerView"
    private const val PROP_SCENE_URL = "sceneUrl"
  }
}
