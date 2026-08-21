import type { ConversationPreferences as Preferences } from "@hackathon/contracts";

const services = [
  "paas",
  "docker",
  "nodejs",
  "postgresql",
  "mysql",
  "object-storage",
];

export function ConversationPreferences({
  value,
  onChange,
}: {
  value: Preferences;
  onChange(value: Preferences): void;
}) {
  function update<K extends "language" | "experience" | "service">(
    key: K,
    next: Preferences[K],
  ) {
    const isDefault = next === null || next === "auto" || next === "unknown";
    const explicit = value.explicit.filter((item) => item !== key);
    if (!isDefault) explicit.push(key);
    onChange({ ...value, [key]: next, explicit });
  }
  return (
    <details className="hackathon-chat__preferences">
      <summary>تنظیم پاسخ</summary>
      <div>
        <label>
          زبان
          <select
            value={value.language}
            onChange={(event) =>
              update("language", event.target.value as Preferences["language"])
            }
          >
            <option value="auto">خودکار</option>
            <option value="fa">فارسی</option>
            <option value="en">English</option>
          </select>
        </label>
        <label>
          سطح تجربه
          <select
            value={value.experience}
            onChange={(event) =>
              update(
                "experience",
                event.target.value as Preferences["experience"],
              )
            }
          >
            <option value="unknown">مشخص نشده</option>
            <option value="novice">تازه‌کار</option>
            <option value="experienced">باتجربه</option>
          </select>
        </label>
        <label>
          سرویس
          <select
            value={value.service ?? ""}
            onChange={(event) => update("service", event.target.value || null)}
          >
            <option value="">همه سرویس‌ها</option>
            {services.map((service) => (
              <option key={service} value={service}>
                {service}
              </option>
            ))}
          </select>
        </label>
      </div>
    </details>
  );
}
