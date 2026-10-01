function catchAsync(handler) {
  return function asyncRouteHandler(req, res, next) {
    return Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function wrapAsyncHandlers(router) {
  if (router.asyncHandlersWrapped) return router;
  router.asyncHandlersWrapped = true;

  // Express 4 does not forward rejected promises from async route handlers.
  for (const method of ["get", "post", "put", "patch", "delete", "options", "head", "all"]) {
    const registerRoute = router[method].bind(router);
    router[method] = (path, ...handlers) =>
      registerRoute(
        path,
        ...handlers.map((handler) =>
          typeof handler === "function" && handler.constructor.name === "AsyncFunction"
            ? catchAsync(handler)
            : handler,
        ),
      );
  }

  return router;
}

module.exports = { catchAsync, wrapAsyncHandlers };