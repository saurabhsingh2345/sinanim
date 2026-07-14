// Object gallery — browse every hand-drawable object the whiteboard scene can
// use, so authors know exactly what `src` word to type. Reads the same
// public/objects/manifest.json the renderer's resolver uses (handmade set +
// Tabler icons), is alias-aware ("money" finds the coin), and copies the concept
// word on click. Capped when unfiltered so 5k icons stay snappy — type to reach all.
import React, { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { ArrowLeft, Search, Check } from 'lucide-react';

interface ObjEntry { name: string; file: string; source: string }
interface Manifest { aliases: Record<string, string>; objects: ObjEntry[]; count?: number; mode?: string }

const CAP = 300; // how many to show before a search narrows things

export default function ObjectsGallery() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [q, setQ] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetch('/objects/manifest.json')
      .then((r) => (r.ok ? r.json() : { aliases: {}, objects: [] }))
      .then(setManifest)
      .catch(() => setManifest({ aliases: {}, objects: [] }));
  }, []);

  // name → the alias words that point at it (so a card can show "also: money, cash")
  const aliasesByTarget = useMemo(() => {
    const m = new Map<string, string[]>();
    if (!manifest) return m;
    for (const [alias, target] of Object.entries(manifest.aliases || {})) {
      const list = m.get(target) ?? [];
      list.push(alias);
      m.set(target, list);
    }
    return m;
  }, [manifest]);

  const results = useMemo(() => {
    if (!manifest) return [];
    const query = q.trim().toLowerCase();
    const all = manifest.objects;
    if (!query) return all.slice(0, CAP);
    return all.filter((o) =>
      o.name.includes(query) ||
      (aliasesByTarget.get(o.name) || []).some((a) => a.includes(query)),
    );
  }, [manifest, q, aliasesByTarget]);

  const copy = (name: string) => {
    navigator.clipboard?.writeText(name).catch(() => {});
    setCopied(name);
    window.setTimeout(() => setCopied((c) => (c === name ? null : c)), 1100);
  };

  const total = manifest?.objects.length ?? 0;
  const showingAll = !q.trim();

  return (
    <>
      <Head><title>newani — object gallery</title></Head>
      <div className="app">
        <header className="topbar">
          <Link href="/" className="back"><ArrowLeft size={16} /> studio</Link>
          <div className="title">
            <span className="glyph">◆</span> drawable objects
            <span className="count">{total ? `${total} icons` : '…'}{manifest?.mode ? ` · ${manifest.mode}` : ''}</span>
          </div>
        </header>

        <p className="lead">
          Use any of these as a whiteboard <code>object</code> — set <code>src</code> to the name.
          Names are fuzzy: type a concept and the closest icon is drawn, so <code>money</code>,
          <code> idea</code> or <code>deploy</code> all resolve. Click a card to copy its name.
        </p>

        <div className="searchbar">
          <Search size={16} />
          <input
            autoFocus
            placeholder="Search objects and synonyms — server, money, git, shield…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && <button className="clear" onClick={() => setQ('')}>clear</button>}
        </div>

        {!manifest ? (
          <div className="note">Loading manifest…</div>
        ) : results.length === 0 ? (
          <div className="note">No object matches “{q}”. It will fall back to a sketched box — pick a more concrete noun.</div>
        ) : (
          <>
            <div className="meta">
              {showingAll
                ? `Showing the first ${results.length} of ${total} — type to search all.`
                : `${results.length} match${results.length === 1 ? '' : 'es'}.`}
            </div>
            <div className="grid">
              {results.map((o) => {
                const also = (aliasesByTarget.get(o.name) || []).slice(0, 3);
                return (
                  <button key={o.file} className={`cell ${o.source}`} onClick={() => copy(o.name)} title={`copy "${o.name}"`}>
                    <span className="thumb">
                      {copied === o.name
                        ? <Check size={22} className="copied" />
                        : <img src={`/objects/${o.file}`} alt={o.name} loading="lazy" width={40} height={40} />}
                    </span>
                    <span className="name">{copied === o.name ? 'copied!' : o.name}</span>
                    {o.source === 'handmade' && <span className="badge">art</span>}
                    {also.length > 0 && <span className="also">{also.join(' · ')}</span>}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      <style jsx>{`
        .app { max-width: 1120px; margin: 0 auto; padding: 20px 22px 80px; color: #e7e7ee; }
        .topbar { display: flex; align-items: center; gap: 18px; padding: 8px 0 16px; }
        .back { display: inline-flex; align-items: center; gap: 6px; color: #a9b0c4; text-decoration: none; font-size: 13px; }
        .back:hover { color: #fff; }
        .title { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 15px; }
        .glyph { color: #8aa0ff; }
        .count { color: #7d849c; font-weight: 400; font-size: 12px; margin-left: 4px; }
        .lead { color: #a9b0c4; font-size: 13.5px; line-height: 1.55; max-width: 760px; margin: 0 0 16px; }
        .lead code { background: #1b1c26; padding: 1px 5px; border-radius: 4px; font-size: 12px; color: #cdd3e6; }
        .searchbar { display: flex; align-items: center; gap: 8px; background: #14151d; border: 1px solid #262838; border-radius: 10px; padding: 9px 12px; color: #9aa; }
        .searchbar input { flex: 1; background: transparent; border: 0; outline: 0; color: #fff; font-size: 14px; }
        .clear { background: none; border: 0; color: #8a90a6; cursor: pointer; font-size: 12px; }
        .meta { color: #7d849c; font-size: 12px; margin: 14px 2px 10px; }
        .note { color: #9aa0b4; font-size: 14px; padding: 40px 4px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(116px, 1fr)); gap: 10px; }
        .cell { position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px;
          background: #12131b; border: 1px solid #23252f; border-radius: 12px; padding: 16px 8px 12px; cursor: pointer; transition: border-color .12s, transform .12s; }
        .cell:hover { border-color: #3a5bd0; transform: translateY(-1px); }
        .thumb { width: 52px; height: 52px; display: flex; align-items: center; justify-content: center;
          background: #f7f5ef; border-radius: 10px; }
        .thumb img { object-fit: contain; }
        .copied { color: #3aa76d; }
        .name { font-size: 12px; color: #cdd3e6; text-align: center; word-break: break-word; line-height: 1.2; }
        .badge { position: absolute; top: 7px; right: 7px; font-size: 9px; text-transform: uppercase; letter-spacing: .04em;
          background: #2a2140; color: #c9b8ff; padding: 1px 5px; border-radius: 5px; }
        .also { font-size: 10px; color: #6b7186; text-align: center; line-height: 1.2; }
      `}</style>
      <style jsx global>{`
        body { background: #0b0b10; margin: 0; font-family: Inter, system-ui, sans-serif; }
      `}</style>
    </>
  );
}
