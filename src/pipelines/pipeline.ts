export interface Pipe<TContext> {
  handle(context: TContext, next: () => Promise<void>): Promise<void>;
}

export async function runPipes<TContext>(
  context: TContext,
  pipes: ReadonlyArray<Pipe<TContext>>,
): Promise<TContext> {
  let lastIndex = -1;

  const dispatch = async (index: number): Promise<void> => {
    if (index <= lastIndex) {
      throw new Error('next() called multiple times in the same pipe.');
    }

    lastIndex = index;
    const pipe = pipes[index];

    if (!pipe) {
      return;
    }

    await pipe.handle(context, () => dispatch(index + 1));
  };

  await dispatch(0);

  return context;
}
