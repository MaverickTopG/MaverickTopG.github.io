export default function AppPage() {
  return (
    <div className="app-page">

      {/* ── Section 1: Hero ── */}
      <section className="app-hero">
        <div className="app-hero-text">
          <p className="app-section-label">NexoLink for iOS</p>
          <h1>The volunteer app built for people who show up.</h1>
          <p className="app-hero-sub">Available on iOS — free to download.</p>
          <a href="#" className="app-store-btn" aria-label="Download on the App Store">
            <svg width="14" height="14" viewBox="0 0 814 1000" fill="currentColor" aria-hidden="true">
              <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105-37.8-155.5-127.4C46 790.7 0 661.7 0 539.8c0-209.1 136.4-319.9 270.7-319.9 99.5 0 182.2 66.1 239.4 66.1 54.7 0 148.4-70 263.2-70 42.8 0 145.3 3.9 218.2 97.2zm-87.4-190.5c49.1-58.5 83.8-140.6 83.8-222.7 0-11.7-.6-23.4-2.6-33.4-79.3 3.2-173.6 53.2-230.2 120.4-44.4 50.4-85.5 131.8-85.5 214.6 0 12.3 2 24.6 2.6 28.5 5.2.6 13.6 1.3 21.9 1.3 70.8 0 158.2-47.8 209.9-108.7z"/>
            </svg>
            Download on the App Store
          </a>
        </div>
        <div className="app-hero-phone">
          <div className="app-phone">
            <img src="/screenshots/IMG_4341.PNG" alt="NexoLink home screen showing volunteer causes" />
          </div>
        </div>
      </section>

      {/* ── Section 2: Track your week ── */}
      <section className="app-feature app-feature--light">
        <div className="app-feature-phone">
          <div className="app-phone">
            <img src="/screenshots/IMG_4342.PNG" alt="Weekly activity view" />
          </div>
        </div>
        <div className="app-feature-text">
          <p className="app-section-label">02</p>
          <h2>See exactly where your time goes.</h2>
          <p>Weekly breakdowns, trend graphs, and calendar views — every hour you give is recorded, organized, and reflected back to you.</p>
          <div className="app-phone app-phone--small">
            <img src="/screenshots/IMG_4345.PNG" alt="Calendar view of volunteer hours" />
          </div>
        </div>
      </section>

      {/* ── Section 3: Log in seconds ── */}
      <section className="app-feature app-feature--dark app-feature--flip">
        <div className="app-feature-text">
          <p className="app-section-label">03</p>
          <h2>Log hours before you even leave.</h2>
          <p>Two fields. Ten seconds. Add a reflection if the moment calls for it. Your contribution is counted — no friction, no forms.</p>
        </div>
        <div className="app-feature-phone">
          <div className="app-phone">
            <img src="/screenshots/IMG_4346.PNG" alt="Log hours screen" />
          </div>
        </div>
      </section>

      {/* ── Section 4: Impact Bento ── */}
      <section className="app-bento">
        <div className="app-bento-card app-bento-card--blue">
          <p className="app-bento-stat">66</p>
          <p className="app-bento-label">Daily goals hit</p>
        </div>
        <div className="app-bento-card app-bento-card--img">
          <img src="/screenshots/IMG_4344.PNG" alt="Trends graph showing volunteer hours over time" />
        </div>
        <div className="app-bento-card app-bento-card--violet">
          <p className="app-bento-stat">727</p>
          <p className="app-bento-label">Total hours logged</p>
        </div>
      </section>

      {/* ── Section 5: CTA ── */}
      <section className="app-cta">
        <h2>Download NexoLink.</h2>
        <a href="#" className="app-store-btn" aria-label="Download on the App Store">
          <svg width="14" height="14" viewBox="0 0 814 1000" fill="currentColor" aria-hidden="true">
            <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105-37.8-155.5-127.4C46 790.7 0 661.7 0 539.8c0-209.1 136.4-319.9 270.7-319.9 99.5 0 182.2 66.1 239.4 66.1 54.7 0 148.4-70 263.2-70 42.8 0 145.3 3.9 218.2 97.2zm-87.4-190.5c49.1-58.5 83.8-140.6 83.8-222.7 0-11.7-.6-23.4-2.6-33.4-79.3 3.2-173.6 53.2-230.2 120.4-44.4 50.4-85.5 131.8-85.5 214.6 0 12.3 2 24.6 2.6 28.5 5.2.6 13.6 1.3 21.9 1.3 70.8 0 158.2-47.8 209.9-108.7z"/>
          </svg>
          Download on the App Store
        </a>
      </section>

    </div>
  );
}
