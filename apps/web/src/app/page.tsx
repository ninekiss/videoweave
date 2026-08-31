import Link from "next/link";

const navigation = [
  ["Workspace", "/"],
  ["Projects", "/projects"],
  ["Shot Calibration", "/analysis"],
] as const;

const quickActions = [
  ["Generate video", "Text, image and keyframe-driven generation", null],
  ["Replicate video", "Decompose, reverse and reconstruct a reference video", null],
  ["Calibrate shots", "Inspect scene-change scores before generating shot assets", "/analysis"],
  ["Extract keyframes", "Create temporal anchors for downstream workflows", "/projects"],
] as const;

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
          <div className="status">Asset + Job + Video Analysis · P0</div>
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
            <span className="muted">Upload, keyframes and shot calibration are live</span>
          </div>
          <div className="grid">
            {quickActions.map(([title, description, href]) => {
              const content = (
                <>
                  <div className="cardPreview" />
                  <h3>{title}</h3>
                  <p className="muted">{description}</p>
                </>
              );
              return href ? (
                <Link className="card" href={href} key={title}>{content}</Link>
              ) : (
                <article className="card" key={title}>{content}</article>
              );
            })}
          </div>
        </section>

        <section className="panel split">
          <div>
            <p className="eyebrow">CURRENT VERTICAL SLICE</p>
            <h2>Video → Candidates → Shots</h2>
            <p className="muted">Detect scene-change candidates once, calibrate the threshold instantly, then create durable Shot and representative-frame assets.</p>
          </div>
          <div>
            <p className="eyebrow">INFRASTRUCTURE</p>
            <ul className="infraList">
              <li><span /> PostgreSQL job state</li>
              <li><span /> Valkey worker queue</li>
              <li><span /> S3-compatible derived assets</li>
            </ul>
          </div>
        </section>
      </section>

      <aside className="inspector">
        <p className="eyebrow">CURRENT CHECK</p>
        <h2>Calibrate real footage</h2>
        <p className="muted small">
          Use Shot Calibration on a real edited clip and compare thresholds such as 10, 7, 5 and 3 before locking a default.
        </p>
        <Link className="primary" href="/analysis" style={{ display: "inline-block", marginTop: 12 }}>Open calibration</Link>
      </aside>
    </main>
  );
}
