export function guard<T>(
  code: string,
  action: () => T,
  recover: () => void = () => {},
): T | undefined {
  try {
    return action();
  } catch (err) {
    console.error(`Room ${code}:`, err);
    try {
      recover();
    } catch (err) {
      console.error(`Room ${code}: recovery failed:`, err);
    }
  }
}
