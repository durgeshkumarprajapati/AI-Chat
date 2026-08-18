// Save native Node 22 globals before JSDOM overrides them
if (global.Request && !global.__nativeRequest) {
  global.__nativeRequest = global.Request;
  global.__nativeResponse = global.Response;
  global.__nativeHeaders = global.Headers;
  global.__nativeFetch = global.fetch;
}
