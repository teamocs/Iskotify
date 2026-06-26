import { Topbar } from '@/components/admin/Topbar'
import { DATA_TABLE_MAP, type DataTableConfig, type DataTableColumnConfig } from '@/lib/dataTables'
import { exportColumnNames } from '@/lib/dataTables/serialization'

export const dynamic = 'force-dynamic'

const TYPE_LABEL: Record<DataTableColumnConfig['type'], string> = {
  text: 'Text',
  textarea: 'Long text',
  number: 'Number',
  boolean: 'true / false',
  json: 'JSON array',
}

// Domain groups — mirror the sidebar's DATA sections.
const GROUPS: { title: string; blurb: string; tables: string[] }[] = [
  {
    title: 'Courses & Careers',
    blurb: 'Feeds the Lists → Courses tab, the Career destinations/countries screens, and Kuya Baw’s career answers.',
    tables: ['career_courses', 'career_facts', 'ai_career_impact', 'career_destinations', 'career_countries', 'career_programs', 'course_taxonomy_map'],
  },
  {
    title: 'Universities & Rankings',
    blurb: 'Feeds the Lists → Universities directory, school detail pages, and the “top schools by course” rankings.',
    tables: ['tertiary_schools', 'university_profiles', 'course_school_rankings', 'course_school_quality', 'bar_results'],
  },
  {
    title: 'Exams & Knowledge',
    blurb: 'Feeds the UPCAT mock exam (passages → blueprint sections) and the exam facts / cutoffs shown on the Exams screen.',
    tables: ['upcat_cutoffs', 'upcat_facts', 'upcat_passages', 'exam_skill_categories', 'exam_blueprint_sections', 'exam_course_notes'],
  },
  {
    title: 'Operations',
    blurb: 'Feeds the in-app Admissions Updates feed.',
    tables: ['admissions_updates'],
  },
]

function colNote(col: DataTableColumnConfig, config: DataTableConfig): string {
  if (col.name === config.idColumn) return `Primary key (${config.idType})`
  if (col.type === 'json') return 'Array — in CSV put JSON (["a","b"]) or a;b;c'
  if (col.type === 'boolean') return 'true / false (blank = false)'
  return ''
}

function FormatTable({ config }: { config: DataTableConfig }) {
  const order = exportColumnNames(config)
  const byName = new Map(config.columns.map(c => [c.name, c]))
  return (
    <div className="overflow-x-auto rounded-[12px] border border-black/[0.06]">
      <table className="w-full text-sm min-w-[520px]">
        <thead className="bg-[#fafafa] border-b border-black/[0.06]">
          <tr>
            {['Column', 'Type', 'Required', 'Notes'].map(h => (
              <th key={h} className="text-left px-3 py-2 text-[11px] font-semibold text-[#aeaeb2] uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-black/[0.04]">
          {order.map(name => {
            const col = byName.get(name)
            const type = col?.type ?? 'text'
            const required = name === config.idColumn || !!col?.required
            return (
              <tr key={name}>
                <td className="px-3 py-1.5 font-mono text-[12px] text-[#1d1d1f]">{name}</td>
                <td className="px-3 py-1.5 text-[#6e6e73]">{TYPE_LABEL[type]}</td>
                <td className="px-3 py-1.5 text-[#6e6e73]">{required ? 'Yes' : ''}</td>
                <td className="px-3 py-1.5 text-[#6e6e73] text-[12px]">{col ? colNote(col, config) : ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function GuidePage() {
  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <Topbar title="User Guide" />
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-3xl space-y-8">

          {/* Intro */}
          <section className="space-y-3">
            <h2 className="text-[#1d1d1f] font-heading font-bold text-2xl tracking-tight">Admin Console Guide</h2>
            <p className="text-[#3a3a3c] text-sm leading-relaxed">
              This console manages all the data the Iskotify mobile &amp; web apps read. Most data lives in
              the <strong>Data</strong> sections of the sidebar, each backed by a uniform editor with the same controls.
            </p>
            <div className="rounded-[12px] border border-black/[0.06] bg-[#fafafa] p-4 space-y-2 text-sm text-[#3a3a3c]">
              <p><strong>Add / Edit / Delete:</strong> click <strong>+ New</strong> to add a row, or click any row to open its editor drawer; the drawer also has a <strong>Delete this row</strong> action.</p>
              <p><strong>Search &amp; pages:</strong> the search box filters by the table’s key columns; long tables paginate 50 rows at a time.</p>
              <p><strong>Export:</strong> <strong>⬇ CSV</strong> (spreadsheet-friendly) or <strong>⬇ JSON</strong> (exact copy). Export streams <em>all</em> rows, not just the current page.</p>
              <p><strong>Import:</strong> <strong>⬆ Import</strong> accepts a CSV <em>or</em> JSON file and <strong>upserts</strong> on the id column — existing ids are updated, new ids are inserted. You’ll see a summary of new / updated / skipped rows.</p>
              <p><strong>Changes reach the apps automatically</strong> on the next sync (every edit/import stamps <code>updated_at</code>, which the app pulls incrementally). No deploy needed.</p>
            </div>
          </section>

          {/* Formats */}
          <section className="space-y-3">
            <h3 className="text-[#1d1d1f] font-heading font-bold text-lg">Import / export formats</h3>
            <ul className="list-disc list-inside text-sm text-[#3a3a3c] space-y-1.5">
              <li><strong>CSV</strong> uses the same column headers shown in each table’s reference below. The easiest way to start is to <strong>Export CSV</strong>, edit in a spreadsheet, then <strong>Import</strong> the same file.</li>
              <li><strong>Array columns</strong> (type “JSON array”, e.g. <code>known_for_courses</code>) are written as JSON text inside one cell — <code>[&quot;Nursing&quot;,&quot;Biology&quot;]</code>. On import you can also use a simple <code>semicolon;separated;list</code>.</li>
              <li><strong>Booleans</strong> are <code>true</code> / <code>false</code> (a blank cell counts as false).</li>
              <li><strong>The id column is required</strong> on every imported row (it’s how upsert matches). For tables with a generated id, leave it blank to create new rows.</li>
              <li><strong>JSON import</strong> expects an array of row objects (or <code>{`{ "rows": [...] }`}</code>) with the same keys.</li>
            </ul>
          </section>

          {/* Special importers */}
          <section className="space-y-3">
            <h3 className="text-[#1d1d1f] font-heading font-bold text-lg">Specialized editors</h3>
            <ul className="list-disc list-inside text-sm text-[#3a3a3c] space-y-1.5">
              <li><strong>UPCAT question bank</strong> (Knowledgebase → Import CSV): use the authoring sheet with <code>option_a…option_d</code> + a letter <code>answer</code>. This is different from a raw table export — don’t mix the two shapes.</li>
              <li><strong>Flashcards, Exam Blueprints, Listings</strong> have their own purpose-built editors in the sidebar; their underlying tables are not in the generic Data sections.</li>
              <li><strong>Passages vs. questions:</strong> reading passages live in <code>upcat_passages</code> (a Data table). The questions that reference them are managed by the UPCAT importer.</li>
            </ul>
          </section>

          {/* Per-domain table references */}
          {GROUPS.map(group => (
            <section key={group.title} className="space-y-4">
              <div>
                <h3 className="text-[#1d1d1f] font-heading font-bold text-lg">{group.title}</h3>
                <p className="text-[#6e6e73] text-sm mt-0.5">{group.blurb}</p>
              </div>
              {group.tables.map(table => {
                const config = DATA_TABLE_MAP[table]
                if (!config) return null
                return (
                  <div key={table} id={table} className="scroll-mt-16 space-y-2">
                    <h4 className="text-[#1d1d1f] font-semibold text-[15px]">{config.label} <span className="font-mono text-[12px] text-[#aeaeb2]">({table})</span></h4>
                    {config.helpText && <p className="text-[13px] text-[#6e6e73] leading-relaxed">{config.helpText}</p>}
                    <FormatTable config={config} />
                  </div>
                )
              })}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
