import { z } from "zod";

const ianaTimezone = z
  .string()
  .refine(
    (tz) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    { message: "Invalid IANA timezone" },
  );

export const updateSettingsInput = z.object({
  timezone: ianaTimezone.optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsInput>;
