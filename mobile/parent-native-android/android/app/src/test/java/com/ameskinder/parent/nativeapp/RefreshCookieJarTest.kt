package com.ameskinder.parent.nativeapp

import okhttp3.CookieJar
import okhttp3.Headers
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.*
import org.junit.Test

class RefreshCookieJarTest {
  class MemoryStore : CookieStore {
    var value: String? = null
    override fun read() = value
    override fun write(value: String?) { this.value = value }
  }
  private val origin = "https://api.ameskinder.com".toHttpUrl()
  private val refresh = "https://api.ameskinder.com/api/auth/refresh".toHttpUrl()
  private fun headers(value: String) = Headers.Builder().add("Set-Cookie", value).build()
  private val cookie = "ames_refresh_token=private; Path=/api/auth; HttpOnly; Secure; Max-Age=86400; SameSite=Strict"

  @Test fun persistsOnlyHostOnlyHttpOnlyRefreshCookieAndReplaysWithinPath() {
    val store = MemoryStore(); val jar = RefreshCookieJar(origin, store)
    jar.capture(refresh, headers(cookie), jar.epoch())
    val cold = RefreshCookieJar(origin, store)
    assertEquals("private", cold.loadForRequest(refresh).single().value)
    assertTrue(cold.loadForRequest("https://api.ameskinder.com/api/students/my-child".toHttpUrl()).isEmpty())
    assertTrue(cold.loadForRequest("https://other.ameskinder.com/api/auth/refresh".toHttpUrl()).isEmpty())
    assertTrue(cold.loadForRequest("http://api.ameskinder.com/api/auth/refresh".toHttpUrl()).isEmpty())
    cold.setCookieJar(CookieJar.NO_COOKIES); cold.removeCookieJar()
    assertEquals(1, cold.loadForRequest(refresh).size)
    val otherBuild = RefreshCookieJar("https://other.ameskinder.com".toHttpUrl(), store)
    assertTrue(otherBuild.loadForRequest("https://other.ameskinder.com/api/auth/refresh".toHttpUrl()).isEmpty())
  }
  @Test fun rejectsBroadDomainWrongPathInsecureAndNonHttpOnlyCookies() {
    for (invalid in listOf(cookie + "; Domain=ameskinder.com", cookie.replace("Path=/api/auth", "Path=/"), cookie.replace("; Secure", ""), cookie.replace("; HttpOnly", ""))) {
      val store = MemoryStore(); val jar = RefreshCookieJar(origin, store)
      jar.capture(refresh, headers(invalid), jar.epoch()); assertNull(store.value)
    }
  }
  @Test fun expiredCookieAndLogoutGenerationCannotRestoreSession() {
    val store = MemoryStore(); val jar = RefreshCookieJar(origin, store)
    val old = jar.epoch(); jar.clear(); jar.capture(refresh, headers(cookie), old); assertNull(store.value)
    jar.capture(refresh, headers(cookie), jar.epoch()); assertNotNull(store.value)
    jar.capture(refresh, headers(cookie.replace("Max-Age=86400", "Max-Age=0")), jar.epoch()); assertNull(store.value)
  }
  @Test fun networkBridgeAddsOriginStripsCookieHeadersAndSupportsColdRefreshAndLogout() {
    val server = MockWebServer(); server.start()
    try {
      val store = MemoryStore(); val base = server.url("/")
      val firstJar = RefreshCookieJar(base, store); val first = buildParentClient(firstJar)
      server.enqueue(MockResponse().addHeader("Set-Cookie", cookie.replace("; Secure", "")).setBody("{}"))
      first.newCall(Request.Builder().url(server.url("/api/auth/login")).post(okhttp3.RequestBody.create(null, ByteArray(0))).build()).execute().use { assertNull(it.header("Set-Cookie")) }
      val login = server.takeRequest(); assertEquals("https://ameskinder.com", login.getHeader("Origin")); assertEquals("https://ameskinder.com/", login.getHeader("Referer"))
      val cold = buildParentClient(RefreshCookieJar(base, store))
      server.enqueue(MockResponse().setBody("{}"))
      cold.newCall(Request.Builder().url(server.url("/api/auth/refresh")).post(okhttp3.RequestBody.create(null, ByteArray(0))).build()).execute().close()
      val restored = server.takeRequest(); assertEquals("ames_refresh_token=private", restored.getHeader("Cookie")); assertEquals(0, restored.bodySize)
      server.enqueue(MockResponse().setBody("{}"))
      cold.newCall(Request.Builder().url(server.url("/api/students/my-child")).build()).execute().close()
      val protected = server.takeRequest(); assertNull(protected.getHeader("Cookie")); assertNull(protected.getHeader("Origin"))
      server.enqueue(MockResponse().setBody("{\"success\":true}"))
      cold.newCall(Request.Builder().url(server.url("/api/auth/logout")).post(okhttp3.RequestBody.create(null, ByteArray(0))).build()).execute().close()
      server.takeRequest(); assertNull(store.value)
    } finally { server.shutdown() }
  }
}
