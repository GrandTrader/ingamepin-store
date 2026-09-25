// Merchant-provided Paypalych exclusion list. Match identity fields, never descriptions.
const rules: ReadonlyArray<readonly [string, RegExp]> = [
  ["Airbnb", /air\s*bnb|эйрбиэнби/],
  ["Amazon", /amazon|амазон/],
  ["eBay", /e\s*bay|ибэй/],
  ["Eneba", /eneba|энеба/],
  ["Exxen", /exxen/],
  ["Gate.io", /gate\s*io/],
  ["H&M", /h\s*(?:and\s*)?m/],
  ["Huawei", /huawei|хуавей/],
  ["JetonCash", /jeton\s*cash/],
  ["Neosurf", /neo\s*surf/],
  ["Noon", /noon/],
  ["Openbucks", /open\s*bucks/],
  ["Paysafecard", /pay\s*safe\s*card/],
  ["Razer Gold", /razer\s*gold|рейзер\s*голд/],
  ["SEAGM", /sea\s*gm/],
  ["S1LKPay", /s[1i]lk\s*pay/],
  ["Visa Prepaid Card", /visa\s+(?:pre\s*paid|gift)|(?:pre\s*paid|предоплаченная|подарочная)\s+(?:card\s+|карта\s+)?visa/],
  ["Tinder Gold", /(?:tinder|тиндер)\s*(?:gold|голд)/],
  ["Tinder Plus", /(?:tinder|тиндер)\s*(?:plus|плюс)/],
  ["Tinder Platinum", /(?:tinder|тиндер)\s*(?:platinum|платинум)/],
  ["Blu TV", /blu\s*tv/],
  ["Bigo Live", /bigo\s*live/],
  ["Tango Live", /tango\s*live/],
  ["AT&T", /at\s*(?:and\s*)?t/],
  ["Base Voucher", /base\s+(?:voucher|gift\s*card|recharge|top\s*up)/],
  ["Cashlib", /cash\s*lib/],
  ["Du Voucher", /du\s+(?:voucher|gift\s*card|recharge|top\s*up)/],
  ["Etisalat", /etisalat/],
  ["Five Voip", /five\s*voip/],
  ["Flexepin", /flexe\s*pin/],
  ["Friendi Aqua", /friendi\s*aqua/],
  ["Hello Voip", /hello\s*voip/],
  ["Jim Mobile", /jim\s*mobile/],
  ["KPN Mobile", /kpn(?:\s*mobile)?/],
  ["Lebara", /lebara|лебара/],
  ["Lucky Mobile", /lucky\s*mobile/],
];

export const PAYPALYCH_BLOCK_MESSAGE = "Paypalych is unavailable for this product. Choose another payment method.";

export function paypalychBlockedBrand(...identityFields: Array<string | null | undefined>): string | null {
  for (const field of identityFields) {
    const text = (field ?? "").normalize("NFKC").toLowerCase()
      .replace(/[\p{M}\p{Cf}]/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (!text) continue;
    for (const [brand, pattern] of rules) {
      if (new RegExp("(?:^| )(?:(?:" + pattern.source + "))(?= |$)", "u").test(text)) return brand;
    }
    // These short mobile brands need an exact identity or a voucher qualifier.
    if (text === "base") return "Base Voucher";
    if (text === "du") return "Du Voucher";
  }
  return null;
}
