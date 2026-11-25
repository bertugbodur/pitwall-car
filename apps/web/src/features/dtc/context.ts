import type { PromptContext, PromptValue } from '@pitwall/ai';
import { getPid, type PidReading } from '@pitwall/obd-core';
import { describeDtc } from '@pitwall/dtc-data';
import type { Language } from '../../i18n/index.ts';
import { useLive } from '../../lib/store.ts';

/** Live values that help explain a fault. Nothing identifying the car or the place. */
const SHARED_PIDS = ['0C', '0D', '05', '04', '06', '07', '0F', '10', '0B', '11', '42'];

export const readingValues = (readings: readonly PidReading[], language: Language): PromptValue[] =>
  readings.map((r) => ({ name: getPid(r.pid)?.name[language] ?? r.name, value: r.value, unit: r.unit }));

/** Builds the AI context for the given codes (default: all of them). */
export async function aiContext(language: Language, only?: string, question?: string): Promise<PromptContext> {
  const { dtcs = [], freezeFrame, values } = useLive.getState();
  const wanted = dtcs.filter((d) => !only || d.code === only);
  const described = await Promise.all(
    wanted.map(async (dtc) => {
      const info = await describeDtc(dtc.code);
      return { code: dtc.code, kind: dtc.kind, title: info.en?.title };
    }),
  );
  const live = SHARED_PIDS.flatMap((pid) => {
    const def = getPid(pid);
    const value = values[pid];
    return def && value !== undefined ? [{ name: def.name[language], value, unit: def.unit }] : [];
  });
  const frame = freezeFrame && (!only || freezeFrame.dtc === only) ? readingValues(freezeFrame.readings, language) : undefined;
  return { language, dtcs: described, freezeFrame: frame, live, question };
}
