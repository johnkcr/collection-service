/**
 * removes optional operator from type
 */
export type Concrete<Type> = {
  [Key in keyof Type]-?: Type[Key];
};

export type Keys<Type> = keyof Type;

export type StringNumber = `${number}`;

export type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;
