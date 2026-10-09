import type { Option } from "../ui/Select";

/*
 * ISO 3166 regions, named by the browser so no list of names ships. The value
 * sent is the English name, because that is what the waitlist stores.
 *
 * The same codes as apps/landing's waitlist form. Duplicated rather than
 * shared: the two apps have no common package, and a static list is a poor
 * reason to make one.
 */
const REGIONS =
  "AF AX AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR XK KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW";

const names = new Intl.DisplayNames(["en"], { type: "region" });

const ALL = REGIONS.split(" ")
  .map((code) => ({ code, name: names.of(code) ?? code }))
  .sort((a, b) => a.name.localeCompare(b.name, "en"));

/**
 * Shaped for `ui/Select`, led by an unchosen option.
 *
 * Nothing is guessed. The obvious guess is `navigator.language`, but that is
 * the language the browser is set to and not where the person is — it reads
 * "United States" for most of the world's English speakers, and a country
 * nobody chose is worse than a blank one, because it is wrong quietly.
 */
export const UNCHOSEN = "";

export const COUNTRIES: Option[] = [
  { value: UNCHOSEN, label: "Select country" },
  ...ALL.map(({ name }) => ({ value: name, label: name })),
];
