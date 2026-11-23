export type ActionState = {
  error?: string;
  ok?: boolean;
  message?: string;
  devCode?: string;
  masked?: string;
  fieldErrors?: Record<string, string>;
};

export const INITIAL_ACTION_STATE: ActionState = {};

export function fieldError(errors: Record<string, string[] | undefined>, key: string) {
  return errors[key]?.[0];
}
