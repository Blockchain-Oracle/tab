import { Suspense } from "react";

import { Playground } from "./playground";

export default function Page() {
  return (
    <Suspense>
      <Playground />
    </Suspense>
  );
}
