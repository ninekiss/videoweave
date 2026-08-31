import Link from "next/link";

const navigation = [
  ["Workspace", "/"],
  ["Projects", "/projects"],
] as const;

const quickActions = [
  ["Generate video", "Text, image and keyframe-driven generation"],
  ["Replicate video", "Decompose, reverse and reconstruct a reference video"],
  ["Analyze video", "Shots, keyframes, camera, motion and quality"],
  ["Extract keyframes", "Create temporal anchors for downstream workflows"],
];

export default function Home() {
  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">VideoWeave</div>
        <nav>
          {navigation.map(([item, href], index) => (
            <Link className={index === 0 ? "navItem active" : "navItem"} href={href} key={item}>
              {item}
            </Link>
          ))}
          {["Assets", "Generate", "Replication", "Storyboard", "Jobs", "Results", "Models", "Workflows", "Settings"].map(
            (item) => <span className="navItem navItemDisabled" key={item}>{item}</span>,
          )}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">VIDEO AI WORKBENCH</p>
            <h1>Workspace</h1>
          </div>
          <div className="status">Platform foundation · P0</div>
        </header>

        <section className="hero panel">
          <div>
            <p className="eyebrow">CAPABILITY FIRST</p>
            <h2>Understand → Generate → Reconstruct → Deliver</h2>
            <p className="muted">
              The UI stays stable while models, workflows, workers and storage providers evolve behind adapters.
            </p>
          </div>
          <Link className="primary" href="/projects">Open projects</Link>
        </section>

        <section>
          <div className="sectionTitle">
            <h2>Quick actions</h2>
            <span className="muted">Projects and direct media upload are now live</span>
          </div>
          <div className="grid">
            {quickActions.map(([title, description]) => (
              <article className="card" key={title}>
                <div className="cardPreview" />
                <h3>{title}</h3>
                <p className="muted">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel split">
          <div>
            <p className="eyebrow">CURRENT VERTICAL SLICE</p>
            <h2>Project → Asset → S3</h2>
            <p className="muted">Create a project, upload video directly to MinIO/S3, then inspect the real ffprobe metadata.</p>
          </div>
          <div>
            <p className="eyebrow">INFRASTRUCTURE</p>
            <ul className="infraList">
              <li><span /> API control plane</li>
              <li><span /> S3-compatible assets</li>
              <li><span /> Multipart resumable upload</li>
            </ul>
          </div>
        </section>
      </section>

      <aside className="inspector">
        <p className="eyebrow">NEXT</p>
        <h2>Validate the asset flow</h2>
        <p className="muted small">
          Open Projects, create a project, upload a real video, and verify preview plus metadata. Job/Worker comes after this UI slice is stable.
        </p>
      </aside>
    </main>
  );
}
