export const options = {
  onError: (problem: Error) => notifications.show({ message: problem.message }),
};
declare const notifications: { show(o: { message: string }): void };
