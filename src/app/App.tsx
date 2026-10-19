import Fjord from '../features/flight/components/Fjord.tsx';
import { OpenExperience } from '../features/experience/experience.context.ts';
import ExperiencePage from '../features/experience/pages/ExperiencePage.tsx';
import Topbar from './components/Topbar.tsx';
import ProjectPage from '../features/projects/pages/ProjectPage.tsx';
import Route from '../features/home/components/Route.tsx';
import HomePage from '../features/home/pages/HomePage.tsx';
import { OpenProject } from '../features/projects/components/ProjectsSection.tsx';
import { BODIES } from './Sections.tsx';
import Warp from './components/Warp.tsx';
import { PROFILE } from '../domains/portfolio/content.ts';
import { useApplicationNavigation } from './hooks/useApplicationNavigation.ts';

export default function App() {
  const { flight, setFlight, detail, project, experience, progress, setProgress, crt, setCrt, warp, setWarp,
    warping, pending, hud, takeFlight, leaveFlight, enterGame, leaveGame, openProject, openExperience, closeDetail, building } = useApplicationNavigation();
  return (
    <>
      {!flight.on && (
        <Topbar detail={detail} hud={hud} progress={progress} crt={crt} onCrt={() => setCrt(!crt)}
          onSection={closeDetail} onFly={takeFlight} />
      )}

      <HomePage hidden={!!detail && !flight.on} flying={flight.on} onFly={takeFlight}
        backdrop={<Fjord
            sectionBodies={BODIES}
            flying={flight.on}
            armed={flight.armed}
            target={flight.target}
            lost={flight.lost}
            game={flight.game}
            warping={building}
            onFly={takeFlight}
            onPortal={enterGame}
            onFjord={leaveGame}
            onArm={() => setFlight((current) => ({ ...current, armed: true }))}
            onExit={leaveFlight}
            onProgress={setProgress}
          />}
        route={<OpenProject.Provider value={openProject}>
          <OpenExperience.Provider value={openExperience}>
            <Route onFly={takeFlight} hud={hud} sectionBodies={BODIES} />
          </OpenExperience.Provider>
        </OpenProject.Provider>}
      />

      {project && !flight.on && <ProjectPage key={project.id} project={project} onBack={() => closeDetail()} onOpen={openProject} />}
      {experience && !flight.on && <ExperiencePage key={experience.hash} entry={experience} onBack={() => closeDetail()} />}

      <footer className="footer">
        <span>
          © {new Date().getFullYear()} {PROFILE.name} — all rights reserved
        </span>
        <span className="exit-code">process exited with code 0</span>
      </footer>

      {warp && (
        <Warp
          key={warp.id}
          onMidpoint={() => {
            const swap = pending.current;
            pending.current = null;
            swap?.();
            setWarp((current) => current && { ...current, crossed: true });
          }}
          onDone={() => {
            warping.current = false;
            setWarp(null);
          }}
        />
      )}
    </>
  );
}
