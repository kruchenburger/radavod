declare namespace Cloudflare {
  interface Env extends WorkerEnv {}
  interface GlobalProps {
    mainModule: typeof import("../src/worker/index");
  }
}

type WorkerEnv = import("../src/worker/env").Env;

declare module "*?raw" {
  const text: string;
  export default text;
}
