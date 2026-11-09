import { dist, geoToWorld } from '@meetspace/venue';
import type { Es } from '../es/client';

type Doc = Record<string, unknown>;
type Q = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * In-memory stand-in for the parts of Elasticsearch the API uses. It evaluates the
 * real query shapes (term/ids/match_all, geo_distance, terms+sum+top_hits aggs,
 * op_type create, if_seq_no) so tests exercise the actual queries, not canned replies.
 * Also backs `pnpm dev:memory` (dev only, never deployed).
 */
export function memoryEs(seed: Record<string, Record<string, Doc>> = {}) {
  const indices = new Map<string, Map<string, Doc>>();
  const seqNos = new Map<string, number>();
  let seq = 0;
  const idx = (name: string) => {
    if (!indices.has(name)) indices.set(name, new Map());
    return indices.get(name)!;
  };
  for (const [name, docs] of Object.entries(seed)) for (const [id, d] of Object.entries(docs)) idx(name).set(id, structuredClone(d));

  const err = (status: number) => Object.assign(new Error(`status ${status}`), { meta: { statusCode: status } });

  const matches = (doc: Doc, id: string, q: Q | undefined): boolean => {
    if (!q || q.match_all) return true;
    if (q.term) {
      const [f, v] = Object.entries(q.term)[0]!;
      return f === 'id' ? (doc.id ?? id) === v : doc[f] === v;
    }
    if (q.ids) return q.ids.values.includes(id);
    if (q.geo_distance) {
      const radius = parseFloat(q.geo_distance.distance);
      const loc = doc.location as { lat: number; lon: number } | undefined;
      if (!loc) return false;
      return dist(geoToWorld(loc), geoToWorld(q.geo_distance.location)) <= radius + 1e-6;
    }
    if (q.bool) {
      const all = [...(q.bool.filter ?? []), ...(q.bool.must ? [].concat(q.bool.must) : [])];
      return all.every((c: Q) => matches(doc, id, c)) && !(q.bool.must_not ?? []).some((c: Q) => matches(doc, id, c));
    }
    throw new Error(`fake ES: unsupported query ${JSON.stringify(q)}`);
  };

  const sum = (docs: Doc[], field: string) => docs.reduce((a, d) => a + (Number(d[field]) || 0), 0);

  const aggregate = (docs: Doc[], aggs: Q): Doc => {
    const out: Doc = {};
    for (const [name, a] of Object.entries(aggs)) {
      if (a.sum) out[name] = { value: sum(docs, a.sum.field) };
      else if (a.cardinality) out[name] = { value: new Set(docs.map((d) => d[a.cardinality.field])).size };
      else if (a.top_hits) out[name] = { hits: { hits: docs.slice(-1).map((d) => ({ _id: 'x', _source: d })) } };
      else if (a.terms) {
        const groups = new Map<string, Doc[]>();
        for (const d of docs) {
          const k = String(d[a.terms.field]);
          groups.set(k, [...(groups.get(k) ?? []), d]);
        }
        let buckets = [...groups].map(([key, g]) => ({ key, doc_count: g.length, ...(a.aggs ? aggregate(g, a.aggs) : {}) }));
        const order = a.terms.order?.[0];
        if (order) {
          const [k, dir] = Object.entries(order)[0] as [string, string];
          const val = (b: Doc) => (k === '_count' ? (b.doc_count as number) : (b[k] as { value: number }).value);
          buckets.sort((x, y) => (dir === 'desc' ? val(y) - val(x) : val(x) - val(y)));
        }
        buckets = buckets.slice(0, a.terms.size ?? 10);
        out[name] = { buckets };
      } else out[name] = { buckets: [] };
    }
    return out;
  };

  const search = async (req: Q) => {
    const docs = [...idx(req.index)].filter(([id, d]) => matches(d, id, req.query));
    let hits = docs.map(([id, d]) => ({ _id: id, _source: d }));
    if (req.sort?.[0]) {
      const [f, dir] = Object.entries(req.sort[0])[0] as [string, string];
      hits.sort((a, b) => String(a._source[f]).localeCompare(String(b._source[f])) * (dir === 'desc' ? -1 : 1));
    }
    hits = hits.slice(0, req.size ?? 10);
    return {
      hits: { total: { value: docs.length }, hits: req._source === false ? hits.map((h) => ({ _id: h._id })) : hits },
      aggregations: req.aggs ? aggregate(docs.map(([, d]) => d), req.aggs) : undefined,
    };
  };

  const es = {
    ping: async () => true,
    get: async ({ index, id }: Q) => {
      const d = idx(index).get(id);
      if (!d) throw err(404);
      return { _id: id, found: true, _source: structuredClone(d), _seq_no: seqNos.get(`${index}/${id}`) ?? 0, _primary_term: 1 };
    },
    index: async (req: Q) => {
      const id = req.id ?? Math.random().toString(36).slice(2);
      const key = `${req.index}/${id}`;
      if (req.op_type === 'create' && idx(req.index).has(id)) throw err(409);
      if (req.if_seq_no !== undefined && req.if_seq_no !== (seqNos.get(key) ?? 0)) throw err(409);
      idx(req.index).set(id, JSON.parse(JSON.stringify(req.document)));
      seqNos.set(key, ++seq);
      return { _id: id, result: 'created' };
    },
    search,
    deleteByQuery: async ({ index }: Q) => {
      const n = idx(index).size;
      idx(index).clear();
      return { deleted: n };
    },
  };
  return { es: es as unknown as Es, docs: (index: string) => idx(index) };
}
