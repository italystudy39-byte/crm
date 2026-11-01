import type { FieldDef } from "@/lib/org";

export function CustomFieldInputs({ defs, values = {} }: { defs: FieldDef[]; values?: Record<string, unknown> }) {
  return (
    <>
      {defs.map((d) => {
        const name = `custom_${d.key}`;
        const v = values[d.key];
        return (
          <div key={d.id}>
            <label className="label">{d.label}</label>
            {d.field_type === "select" ? (
              <select name={name} defaultValue={String(v ?? "")} className="input">
                <option value="">—</option>
                {d.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : d.field_type === "boolean" ? (
              <input type="checkbox" name={name} defaultChecked={Boolean(v)} />
            ) : (
              <input
                name={name}
                type={d.field_type === "number" ? "number" : d.field_type === "date" ? "date" : "text"}
                defaultValue={v == null ? "" : String(v)}
                className="input"
              />
            )}
          </div>
        );
      })}
    </>
  );
}

export function CustomFieldValues({ defs, values }: { defs: FieldDef[]; values: Record<string, unknown> }) {
  const shown = defs.filter((d) => values[d.key] !== undefined && values[d.key] !== "");
  if (!shown.length) return null;
  return (
    <dl className="grid grid-cols-2 gap-2 text-sm">
      {shown.map((d) => (
        <div key={d.id}>
          <dt className="text-slate-500">{d.label}</dt>
          <dd>{d.field_type === "boolean" ? (values[d.key] ? "Да" : "Нет") : String(values[d.key])}</dd>
        </div>
      ))}
    </dl>
  );
}
