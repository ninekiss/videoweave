const navigation = [
  "Workspace",
  "Projects",
  "Assets",
  "Generate",
  "Replication",
  "Storyboard",
  "Jobs",
  "Results",
  "Models",
  "Workflows",
  "Settings",
];

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
          {navigation.map((item, index) => (
            <button className={index === 0 ? "navItem active" : "navItem"} key={item} type="button">
              {item}
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">VIDEO AI WORKBENCH</p>
            <h1>Workspace</h1>
          </div>
          <div className="status">Platform scaffold · P0</div>
        </header>

        <section className="hero panel">
          <div>
            <p className="eyebrow">CAPABILITY FIRST</p>
            <h2>Understand → Generate → Reconstruct → Deliver</h2>
            <p className="muted">
              The UI stays stable while models, workflows, workers and storage providers evolve behind adapters.
            </p>
          </div>
          <button className="primary" type="button">New project</button>
        </section>

        <section>
          <div className="sectionTitle">
            <h2>Quick actions</h2>
            <span className="muted">Initial information architecture</span>
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
            <p className="eyebrow">ACTIVE JOBS</p>
            <h2>No jobs yet</h2>
            <p className="muted">Generation and processing operations will appear here as asynchronous jobs.</p>
          </div>
          <div>
            <p className="eyebrow">INFRASTRUCTURE</p>
            <ul className="infraList">
              <li><span /> API control plane</li>
              <li><span /> S3-compatible assets</li>
              <li><span /> GPU / CPU workers</li>
            </ul>
          </div>
        </section>
      </section>

      <aside className="inspector">
        <p className="eyebrow">INSPECTOR</p>
        <h2>Workspace status</h2>
        <dl>
          <div><dt>Phase</dt><dd>P0</dd></div>
          <div><dt>Projects</dt><dd>0</dd></div>
          <div><dt>Jobs</dt><dd>0</dd></div>
          <div><dt>Workers</dt><dd>Not connected</dd></div>
        </dl>
        <p className="muted small">This page is the initial visual shell, not a mock implementation of unfinished backend capabilities.</p>
      </aside>
    </main>
  );
}
