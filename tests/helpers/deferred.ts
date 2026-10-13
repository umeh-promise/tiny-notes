export function deferred<T>() {
  return Promise.withResolvers<T>();
}
