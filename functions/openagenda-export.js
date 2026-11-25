export async function fetchOpenAgendaExport(fetcher, url, maxBytes) {
  const response = await fetcher(url, {
    headers:{ Accept:'text/csv' }, credentials:'omit', redirect:'manual', signal:AbortSignal.timeout(6500),
  });
  const reader = response.body?.getReader();
  try {
    if (!response.ok || !/^text\/csv\b/i.test(response.headers.get('content-type') ?? '') ||
        !reader || Number(response.headers.get('content-length')) > maxBytes) throw new Error('Agenda niet beschikbaar');
    const decoder = new TextDecoder('utf-8',{fatal:true});
    let input = '', size = 0;
    for (;;) {
      const {done,value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error('Agenda is groter dan de leeslimiet');
      input += decoder.decode(value,{stream:true});
    }
    return input + decoder.decode();
  } finally { reader?.cancel().catch(()=>{}); }
}
