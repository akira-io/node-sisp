export async function resolve(specifier, context, next) {
  if (specifier === 'knex' || specifier.startsWith('knex/')) {
    const error = new Error("Cannot find package 'knex'");
    error.code = 'ERR_MODULE_NOT_FOUND';

    throw error;
  }

  return next(specifier, context);
}
