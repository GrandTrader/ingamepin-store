"use client";

import { setProductChannel } from "./channel-actions";
import ProductListSwitch from "./ProductListSwitch";

export default function ProductChannelSwitches({ id, name, business, retail }: {
  id: string;
  name: string;
  business: boolean;
  retail: boolean;
}) {
  return (
    <div className="grid">
      <ProductListSwitch enabled={business} label={"Business portal for " + name} caption="Business portal"
        save={(enabled) => setProductChannel(id, "business", enabled)} />
      <ProductListSwitch enabled={retail} label={"Retail site for " + name} caption="Retail site"
        save={(enabled) => setProductChannel(id, "retail", enabled)} />
    </div>
  );
}
