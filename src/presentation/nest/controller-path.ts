function trimSlashes(path: string): string {
  return path
    .split('/')
    .filter((segment) => segment !== '')
    .join('/');
}

export function controllerPath(basePath: string, globalPrefix?: string): string {
  const path = trimSlashes(basePath);
  const prefix = trimSlashes(globalPrefix ?? '');

  if (prefix === '') {
    return path;
  }

  if (path !== prefix && !path.startsWith(`${prefix}/`)) {
    throw new Error(
      `basePath "${basePath}" must start with the Nest global prefix "${globalPrefix}". ` +
        'The signed URLs the package generates include basePath, so the controller has to be ' +
        'mounted at the same place the gateway is told to return to.',
    );
  }

  return trimSlashes(path.slice(prefix.length));
}
