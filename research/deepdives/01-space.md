# Deep Dive 01 — Space Economy & Orbital Infrastructure (2026–2036)
*Wave-1 research agent output, full version with reasoning and sources. Method caveat: WebFetch was blocked (HTTP 403) in-environment, so figures rest on cross-checked WebSearch extractions; the most load-bearing numbers (launch $/kg, SBSP mass/launches, gallium concentration, orbital-DC viability) were corroborated across ≥2 independent sources.*

## Bottom line
The space economy's *current* puck is launch cost — but that is on a credible glide path to commoditization (Starship + New Glenn). The *next* scarcities are the downstream physical inputs that don't ride reusability/Moore's-law curves: space-grade power (GaAs/III-V cells + gallium), thermal rejection (radiators), radiation-hardened/qualified electronics, optical terminals, ground/downlink capacity, spectrum & orbital slots, noble-gas propellant, and — beneath all of it — qualified human capital and pad/regulatory throughput. The popular narratives (orbital data centers, space-based solar power) are real demand signals but **overstated on timeline by ~5–15 years** because they collide with thermal physics and the same scarce inputs.

## 1. 10-Year roadmap (near-certain vs speculative)
**Reusable launch (near-certain backbone):**
- 2026: Starship V3 operational ramp; FAA cap raised to 25/yr at Starbase (May 2025); 3 Florida pads under construction, first FL launches ~mid-2026. New Glenn flew NG-2 with booster landing (Nov 2025), reused booster NG-3 (Apr 2026, upper-stage anomaly); Blue targeting 6–8 flights in 2026.
- 2026–2027: Starship propellant-transfer demo (ship-to-ship).
- ~2028–2030: credible window for Starship to reach **$100–300/kg** *if* 10–20 reuses at high reliability. **This is the gating variable for everything downstream.** Treat sub-$100/kg and "thousands of launches/yr" as speculative this decade (pad/regulatory-bound).

**Mega-constellations (near-certain):** ~7,000+ Starlink operational of ~11,800 active; Kuiper deploying toward 3,236; China Guowang (~13,000) and Qianfan/SpaceSail (~15,000 by 2030) behind schedule. 2026–2030 ITU "bring-into-use" deadlines force deploy-or-forfeit.

**Orbital data centers (speculative on timeline):** Starcloud-1 launched 2025 with a single NVIDIA H100 (a demo); raised $170M Series A (Mar 2026). Google "Project Suncatcher" gate test ~2027. Independent analysis: **<15% probability** of meaningful-scale economic viability by 2029–2031, rising to **30–40% by 2032–2035** only if three conditions co-occur (cheap launch + rad-qualified commercial compute + space-grade power at scale).

**Space-based solar power (speculative/late):** Japan ~1 kW transmission demo (2025); Space Solar (UK) targets ~30 MW ~2030–2031 (aggressive); China ZhuRi ~10 MW pilot ~2035. Utility-scale GW SBSP is a **2040s** story (5,000–20,000+ tonnes, ~40+ launches, $10–20B/GW).

**In-space manufacturing (real but niche):** Varda W-4 in orbit; FAA unlimited-reentry approval (Jun 2025); pharma crystallization the only near-term revenue case.

**Space resources/mining:** no binding near-term relief this decade; lunar/asteroid resources are 2035+.

## 2. Value-chain map
Launch ($/kg, pad throughput, cryo-propellant, FAA permits) → on-orbit propulsion (xenon/krypton, Hall thrusters) → **power (space-grade GaAs/III-V cells, gallium, arrays)** → **thermal (radiators, Stefan-Boltzmann ~100–350 W/m²)** → compute/electronics (rad-hard chips, test-beam time) → space comms (OISL, spectrum) → ground comms (optical ground stations, DSN) → regulatory/orbital (ITU spectrum, slots, debris) → reentry/ISM → human capital (cross-cutting).

## 3. Structural scarcities (ranked by binding × investable)

### #1 Space-grade power: GaAs/III-V solar cells + gallium
- **Why binding:** Space-grade triple-junction III-V cells (>30–40% eff., Ge substrate) are the only viable orbital power at scale. Merchant market tiny/oligopolistic (~$1.5B/yr), global GaAs space-cell capacity single-digit-to-low-tens of MW/yr at >$200/W (Spectrolab/Boeing, SolAero/Rocket Lab, Azur/CESI). Underneath: **China ~98% primary gallium, ~60% germanium**, used as export leverage 2023–2025 (suspended only to ~Nov 2026).
- **Timing:** Binds ~2027–2029 as Kuiper/Guowang/Qianfan deploy in parallel + any orbital-DC/SBSP pilots demand MW-class arrays. A single 40 MW orbital DC at $200/W implies array spend dwarfing today's entire annual space-cell output. Eases slowly post-2030 via new fab capex (3–5 yr lead) and/or perovskite/thin-film qualification.
- **Moat:** High — epitaxial III-V fabs capital-intensive, low-yield, slow to qualify; gallium geopolitical; flight-heritage barrier.
- **Substitution:** Perovskite/CIGS thin-film (radiation-durability unproven), gallium recycling. 3–7 yrs out.
- **Investable:** **Rocket Lab (RKLB)** (SolAero + STARRAY) cleanest public pick-and-shovel; Boeing (BA, Spectrolab); gallium/Ge ex-China recovery (watch MP-type plays); Azur/CESI private/EU.

### #2 Thermal rejection (radiators) — the physics chokepoint for orbital compute
- **Why binding:** In vacuum, heat dumps only by radiation (~100–350 W/m², 5–10 kg/m² penalties that can exceed compute hardware mass). No merchant radiator market — a tell. The single hardest physical reason orbital DCs are timeline-overstated.
- **Timing:** Binds the moment anyone tries >1 MW in orbit (2027+); does NOT ease — physics floor.
- **Moat:** Very high (physics). Cannot be bought down by launch-cost curves.
- **Substitution:** Low for physics; medium for engineering (run chips hotter, deployable radiators).
- **Investable:** Mostly private/OEM-integrated — a *short-the-hype* signal more than a long. Whoever cracks deployable high-temp low-areal-mass radiators at 10–100 MW becomes the unexpected chokepoint owner (currently un-investable publicly).

### #3 Radiation-hardened / qualified electronics + test-beam time
- **Why:** Rad-hard foundry capacity scarce (lead times >52 wks); ion-beam/accelerator test time has 6–12mo backlogs. Every mega-constellation sat + orbital-DC chip competes for the same beam time/slots.
- **Timing:** Already binding (2025), tightens to 2028. Orbital-DC thesis hinges on commercial chips surviving LEO in shielded enclosures at <2x premium (vs 5–10x full rad-hard) — Google's ~2027 test is the gate.
- **Moat:** High (foundry capex, qual IP, scarce facilities).
- **Investable:** Microchip (MCHP), BAE Systems, Frontgrade (private), STMicro (STM).

### #4 Optical inter-satellite links (OISL)
- **Why:** Mandatory for mesh constellations / space-compute fabric; gated by scarce optical engineers + long-lead photonics. Mynaric repeatedly missed SDA ramps; **Rocket Lab acquired Mynaric (Apr 2026, ~$155M)** to break the bottleneck.
- **Timing:** Binding now (2025–2027), eases ~2028+ as RKLB/CACI/Tesat scale; talent the durable constraint.
- **Investable:** Rocket Lab (RKLB, owns Mynaric), CACI (SA Photonics), Airbus (Tesat).

### #5 Ground/downlink capacity ("downlink deficit")
- **Why:** Space segment racing to terabit-class while ground is stuck. Optical ground stations need 6–11 cloud-diverse sites/region (>1,000 km apart); single-site availability ~69%. DSN aging/oversubscribed (Goldstone 70m damaged Sept 2025).
- **Timing:** Binding 2026–2030 for LEO optical; DSN already a hard constraint for cislunar.
- **Investable:** Cailabs (private, €57M), Space Compass (private, Japan), KSAT (private), AWS Ground Station (AMZN).

### #6 Spectrum & orbital slots (regulatory scarcity with a clock)
- **Why:** Ku/Ka congested; new entrants pushed to Q/V bands. ITU "bring-into-use" deadlines force deploy-or-forfeit within ~a decade. LEO shells (~550 km) crowding.
- **Timing:** Binding now–2030; prime shells + best spectrum permanently claimed THIS decade.
- **Moat:** Very high — first-mover entrenchment ("orbital entrenchment").
- **Investable:** Largely private — SpaceX/Starlink, Amazon Kuiper (AMZN), SpaceSail/Qianfan (China state), Eutelsat/OneWeb (ETL.PA).

### #7 Noble-gas propellant (xenon → krypton)
- **Why:** Hall thrusters need xenon/krypton; xenon byproduct of air separation, chronically short. Spot xenon ~$6,000/kg in 2024 (from ~$3,000 in 2021), 15–20%/yr demand growth. Krypton the relief valve.
- **Timing:** Intermittent 2025–2030; eases via recycling + krypton/argon/water alternatives. HIGH substitution.
- **Investable:** Linde (LIN), Air Liquide (AI.PA); Rocket Lab (RKLB, built 200-unit thruster line).

### #8 Pad throughput & launch-licensing (the launch-cost asterisk)
- **Why:** Even at $/kg parity, how often a pad can be legally cleared to fly binds. FAA environmental review, deluge-water permitting, airspace closures cap cadence far below "thousands/yr." SpaceX now seeking overseas sites.
- **Timing:** Binding 2026–2030; partial relief as FL + international sites come online.
- **Investable:** Incumbents with pad real estate (SpaceX private, Blue Origin); Rocket Lab (RKLB, Neutron + own pads).

### #9 Reentry/ISM downmass & human capital (cross-cutting)
- Reentry capacity gates ISM (Varda private, Inversion, RKLB). **Human capital: ~15% attrition (2x other industries), an "experience cliff" of mid-career systems/propulsion/RF engineers — the most underpriced cross-cutting scarcity; caps every layer's ramp; no clean public play.**

## 4. Non-consensus
**Thermal rejection is the TRUE binding constraint on orbital compute, not launch cost.** Even at $200/kg with cheap chips you cannot reject tens of MW in vacuum without radiator area/mass rivaling the compute payload. Whoever cracks deployable high-temp radiators at 10–100 MW becomes the chokepoint owner — currently un-investable (buried in primes). Secondary: gallium/space-grade-cell capacity (~98% gallium behind a Chinese export valve; space-cell output single-digit MW/yr). Orbital-DC viability <15% by 2029–31; a 1-GW orbital DC pencils at >$50B (~3x terrestrial). SBSP utility-scale is a 2040s story.

## 5. Confidence
Medium-High on identity/ordering of scarcities (#1 power, #2 thermal, #3 rad-electronics, #6 spectrum robust). Medium on exact timing (keys off Starship $/kg-and-reliability). Lower on orbital-DC/SBSP dates (lean skeptical-on-timeline). **What would change the view:** Starship <$150/kg with >95% reliability before 2029; perovskite/thin-film space qualification; deployable high-temp radiator breakthrough; end of Chinese gallium leverage; a Kessler-type debris cascade.

## 6. Sources
Launch/pads: orbitalradar.com/space-economy/launch-cost-trends · nextbigfuture.com/2025/08 · space.com (FAA 25 launches) · spacenews.com (env approval) · techtimes.com/articles/316637 (overseas sites) · spaceflightnow.com/2026/04/19 (New Glenn reuse) · blueorigin.com/news (NG-2) · newspaceeconomy.ca/2025/12/10 (orbital refueling).
Orbital DCs: useluminix.com · spaceinvestments.io · newsletter.forethought.org · blocksandfiles.com/2025/10/23 · spectrum.ieee.org/orbital-data-centers · techcrunch.com/2026/02/11 (brutal economics) · gao.gov/products/gao-26-109012 · techcrunch.com/2026/03/30 (Starcloud $170M) · blogs.nvidia.com/blog/starcloud.
SBSP: ciphernews.com · newspaceeconomy.ca/2025/11/19 · nasa.gov SBSP report 2024.
Power/gallium: peraspera.us/space-power · stimson.org/2025 (Ge/Ga) · pillsburylaw.com (suspension) · usitc.gov (Ge/Ga).
Rad-hard: breakingdefense.com/2025/03 · marketsandmarkets / researchnester (rad-hard market).
Optical/ground: investors.rocketlabcorp.com (Mynaric) · ts2.tech (OISL boom) · satnews.com/2026/04/03 (downlink deficit) · interactive.satellitetoday.com · payloadspace.com (Cailabs) · oig.nasa.gov (DSN) · gizmodo.com (Goldstone).
Spectrum/debris: takshashila.org.in (orbital entrenchment) · sciencedirect.com S0308596126000479 · interestingengineering.com (China constellations) · esa.int Space Environment Report 2025 · internationalinsurance.org (debris).
Propellant/ISM/workforce: sets.space (xenon/krypton) · stocktitan.net (RKLB thruster) · prnewswire.com (Varda $187M) · aerospaceamerica.aiaa.org (ISM market; engineer shortage) · satnews.com/2026/01/09 (retention crisis).
