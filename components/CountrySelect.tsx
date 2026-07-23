import countries from "i18n-iso-countries";
import englishCountries from "i18n-iso-countries/langs/en.json";

countries.registerLocale(englishCountries);

type CountrySelectProps = {
  defaultValue?: string;
};

export default function CountrySelect({
  defaultValue = "India",
}: CountrySelectProps) {
  const countryNames = Object.values(
    countries.getNames("en", {
      select: "official",
    }),
  ).sort((first, second) =>
    first.localeCompare(second, "en"),
  );

  return (
    <label>
      <span className="text-sm font-bold">
        Region
      </span>

      <select
        name="region"
        required
        defaultValue={defaultValue}
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