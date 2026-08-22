"use client";

import countries from "i18n-iso-countries";
import englishCountries from "i18n-iso-countries/langs/en.json";
import { useState } from "react";
import CountryFlag from "./CountryFlag";

countries.registerLocale(englishCountries);

type CountrySelectProps = {
  defaultValue?: string;
};

export default function CountrySelect({
  defaultValue = "India",
}: CountrySelectProps) {
  const [selectedRegion, setSelectedRegion] = useState(defaultValue);
  const countryNames = Object.values(
    countries.getNames("en", {
      select: "official",
    }),
  ).sort((first, second) =>
    first.localeCompare(second, "en"),
  );

  return (
    <label>
      <span className="flex items-center gap-2 text-sm font-bold"><CountryFlag region={selectedRegion} /> Region</span>

      <select
        name="region"
        required
        defaultValue={defaultValue}
        onChange={(event) => setSelectedRegion(event.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      >
        <option value="Global">
          Global / Worldwide
        </option>

        {countryNames.map((country) => (
          <option
            key={country}
            value={country}
          >
            {country}
          </option>
        ))}
      </select>
    </label>
  );
}
