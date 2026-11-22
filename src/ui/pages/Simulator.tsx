import { simulationData } from '../../data/schema'
import { POLL_HALF_LIFE_DAYS, SAMPLE_SIZE_CAP } from '../../domain/pollAverage'
import { noIntentionRange } from '../../domain/secondRound'
import type { SimulationResult } from '../../domain/types'
import { CampaignTrajectory } from '../components/CampaignTrajectory'
import { ElectedPresident } from '../components/ElectedPresident'
import { FirstRoundChart } from '../components/FirstRoundChart'
import { QualificationSwitch } from '../components/QualificationSwitch'
import { RetainedPolls } from '../components/RetainedPolls'
import { ScenarioBar } from '../components/ScenarioBar'
import { SecondRoundDuel } from '../components/SecondRoundDuel'
import type { SettingsTab } from '../components/SettingsSheet'
import { VoteFlow } from '../components/VoteFlow'
import { integer, range } from '../format'
import { Link } from '../Link'

const NO_INTENTION = noIntentionRange(simulationData.polls.secondRoundPolls)

export function Simulator({
  result,
  onOpenSettings,
}: {
  result: SimulationResult
  onOpenSettings: (tab?: SettingsTab) => void
}) {
  return (
    <>
      <div className="max-w-full pb-8 pt-10 sm:pt-14">
        <h1 className="wide text-[2rem] font-extrabold leading-[1.05] tracking-tight sm:text-[2.75rem]">
          Présidentielle 2027
        </h1>
        <h2 className="text-[1.7rem]">Simulateur probabiliste des résultats de second tour</h2>
        <div className="mt-3 space-y-[1lh] text-[1.05rem] leading-relaxed text-ink-2">
          <p>
            Dans les sondages directs de second tour,{' '}
            {NO_INTENTION ? range(NO_INTENTION.min, NO_INTENTION.max) : 'une part importante'} des personnes
            interrogées n’expriment aucun choix entre les deux candidats (indécis, blanc, nul ou abstention),
            ce qui fragilise leur lecture directe.
            {NO_INTENTION && (
              <>
                {' '}
                Cette fourchette couvre les {NO_INTENTION.polls.length} duels publiés en dernier par{' '}
                {new Set(NO_INTENTION.polls.map((p) => p.institute)).size} instituts (
                <Link to="methodologie" hash="limites" className="link">
                  détail par sondage
                </Link>
                ).
              </>
            )}
          </p>
          <p>Ce simulateur reconstruit les seconds tours de 2027 selon une méthode sobre et testable :</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>1er tour pondéré</strong> : dernier sondage de chaque institut pondéré par sa fraîcheur
              (demi-vie de {POLL_HALF_LIFE_DAYS} jours) et sa taille d’échantillon (plafonnée à{' '}
              {integer(SAMPLE_SIZE_CAP)}), avec projection d’offre par paires propres intra-institut et aucune
              correction déterministe fondée sur 2017–2022.
            </li>
            <li>
              <strong>Alliances testées uniquement</strong> : seules les configurations effectivement posées
              aux sondés par au moins un institut sont proposées.
            </li>
            <li>
              <strong>2nd tour en flux bruts (% des inscrits)</strong> : interpolation logit directe entre
              deux repères mesurés — présidentielle 2022 (0 %) et législatives 2024 (100 %) — sur les 4 types
              de duels face au RN, curseur dédié et analyse de sensibilité pour le report gauche hors LFI →
              Mélenchon (non mesuré en présidentielle), présidentielles 2007–2012 pour les duels hors RN, et
              option activable pour les déclarations 2027 corrigées en logit.
            </li>
            <li>
              <strong>Projection temporelle (activée par défaut)</strong> : projection vers avril 2027 centrée
              sur le vote utile par bloc (réglable dans les réglages avancés ; amortissement et tendance
              récente désactivés par défaut à 0 %), avec bascule en un clic vers la photographie actuelle («
              Aujourd’hui »).
            </li>
            <li>
              <strong>Incertitude explicite</strong> : {integer(result.monteCarlo.iterations)} simulations
              Monte-Carlo propageant la volatilité historique des campagnes (1995–2022), l’incertitude des
              reports (dont la plage gauche hors LFI → Mélenchon) et, par défaut (hors alliance forcée),
              l’incertitude sur les candidatures au centre et à droite.
            </li>
          </ul>
          <p>
            À cet horizon, les rapports de force évoluent encore fortement : cet outil permet d’explorer des
            scénarios et leurs marges d’incertitude, pas de prédire l’issue de 2027.{' '}
            <Link to="methodologie" className="link">
              Voir la méthodologie et la validation historique
            </Link>
          </p>
        </div>
      </div>

      <ScenarioBar result={result} onOpenSettings={onOpenSettings} />

      {result.warnings.length > 0 && (
        <ul aria-live="polite" className="mt-4 space-y-2">
          {result.warnings.map((w) => (
            <li
              key={w}
              className="rounded-lg border-l-4 border-hypo bg-hypo-soft px-4 py-2.5 text-sm text-ink"
            >
              {w}
            </li>
          ))}
        </ul>
      )}

      <RetainedPolls result={result} />

      <QualificationSwitch result={result} />

      <div className="mt-10">
        <SecondRoundDuel result={result} />
      </div>

      <div className="mt-12 grid items-start gap-x-12 gap-y-12 lg:grid-cols-2">
        <div className="min-w-0">
          <ElectedPresident result={result} />
        </div>
        <div className="min-w-0">
          <CampaignTrajectory result={result} />
        </div>
      </div>

      <div className="mt-12 grid items-start gap-x-12 gap-y-12 lg:grid-cols-2">
        <div className="min-w-0">
          <FirstRoundChart result={result} onOpenSettings={onOpenSettings} />
        </div>
        <div className="min-w-0">
          <VoteFlow result={result} />
        </div>
      </div>
    </>
  )
}
