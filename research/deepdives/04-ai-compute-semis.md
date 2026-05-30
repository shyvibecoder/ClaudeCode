# Deep Dive 04 — AI Compute, Semiconductors & Datacenter Networking (2026–2036)
*Wave-1 research agent output, full version. Built from 2025–2026 trade press, analyst notes (TrendForce, DIGITIMES), company roadmaps + SEC filings. Roadmap dates routinely slip 6–18 months; capacity figures are estimates. Treat the SEQUENCE as higher-confidence than absolute dates.*

## Core thesis
The binding constraint has already migrated once — from GPUs (logic wafers) → HBM + CoWoS advanced packaging → now into power. The investment-relevant question is the *next* migrations the market under-prices: (1) **HBM/TSV capacity + the DRAM-wafer opportunity cost**, (2) **3D hybrid bonding (SoIC) + silicon→glass interposer**, (3) **specialty materials** (ABF substrate, T-glass, EUV photoresist, e-gases), (4) **optical interconnect / co-packaged optics**, (5) **power electronics (SiC/GaN) for the 800V HVDC transition**. Skeptic flag: an AI-capex digestion air-pocket in **2027–2028** could un-bind several simultaneously.

## 1. 10-Year roadmap (dated, with slip risk)
**Leading-edge logic:** N2 (2nm GAA) mass production Q4 2025, 2026–2027 sold out; A16 (1.6nm, backside power) volume **2027**; A14 (1.4nm) ~**2028** (TSMC skips High-NA here; Intel adopts at 14A); A10/sub-1nm ~2030+.
**HBM:** HBM4 ramped **Feb 2026** (SK Hynix ~57% Q4'25 share); HBM4E samples mid-2026, volume **2027**; HBM5 ~**2029** (custom base die pulls HBM into foundry/packaging chain).
**Advanced packaging:** CoWoS ~35k wpm (2024) → 70–80k (end-2025) → **120–130k (end-2026)** → ~170k (end-2027), + OSAT overflow (ASE, Amkor). SoIC (3D hybrid bonding) ~14k wpm (2025), big step-up **2027+**; capex ~**$6.8–7.0B per 10k wafers** (throttles ramp). CoPoS / panel-level glass (310×310mm) mass production **2028–2029**.
**Litho:** ASML High-NA EXE:5200B first shipments 2025; limited production **2027–2028**; ~$350M/tool.
**Co-packaged optics:** NVIDIA Quantum-X early 2026, Spectrum-X 2H2026 → **>35% penetration by 2030**; NVIDIA ~$4B committed (Coherent + Lumentum).
**Custom silicon:** ASIC unit growth 44.6% vs GPU 16.1% (2026); **ASIC shipments surpass GPU units by 2027**; Broadcom+Marvell ≈95% of co-design (Broadcom ~60%).
**Power:** 800V HVDC pilots 2026 → **NVIDIA Kyber rack mass production 2027** = HVDC inflection driving SiC/GaN content.

## 2. Value-chain map
Materials (quartz/polysilicon→wafers; ABF film [Ajinomoto monopoly]; T-glass; EUV photoresist; e-gases; sputtering targets) → Fabs (TSMC/Intel/Samsung logic; SK Hynix/Samsung/Micron DRAM) → Litho/WFE (ASML EUV monopoly; AMAT/Lam/TEL/KLA) → Advanced packaging (TSMC CoWoS/SoIC/CoPoS; OSATs ASE/Amkor; hybrid-bond tools BESI/EVG/AMAT/TEL) → Substrates (Ibiden/Shinko/Unimicron/AT&S/Nan Ya) → Memory (HBM on TSV) → Accelerators (NVIDIA; Broadcom/Marvell ASIC; AMD) → Interconnect (NVLink copper; UALink/Ethernet; optical/CPO — Coherent/Lumentum/Broadcom) → Systems (racks, CDUs/cold plates, SiC/GaN — Navitas/Infineon/Vertiv) → Datacenters.

## 3. Structural scarcities (in migration sequence)

### S1 Leading-edge logic wafers (N2/A16) — partially bound, the "old" puck
Binds 2025–2027, eases into 2028 (TSMC AZ/Taiwan fabs). Moat extreme (TSMC ~monopoly, $20B+/fab, 3–4yr lead). Expressions: TSMC (TSM), ASML, AMAT/LRCX/KLAC; Intel as optionality.

### S2 Advanced packaging: CoWoS + SoIC — binding NOW, the current puck
CoWoS tight through 2026, eases somewhat 2027 (170k wpm + OSAT). **SoIC binds 2027–2029** ($7B/10k wafers throttles ramp). Interposer reticle limits push silicon→glass/panel (CoPoS) **2028–2029**. Moat very high (TSMC; hybrid-bond tools concentrated BESI/EVG/AMAT). Expressions: TSMC, **BESI** (purest hybrid-bonding), ASE/Amkor, AMAT/TEL, SCHMID (panel equipment).

### S3 HBM + TSV capacity — binding NOW, under-appreciated opportunity cost ⭐
Non-obvious point: **HBM consumes ~3× DRAM wafer capacity per GB vs DDR5**, and **>70% of industry TSV capacity in 2026** goes to HBM → drains commodity DRAM → spills into PC/server DDR5 pricing (cross-market scarcity few model). Binds 2026–2028; wafer opportunity cost worsens as stacks get taller and custom HBM (2029) pulls logic base dies onto scarce foundry capacity. Moat oligopoly (SK Hynix>Samsung>Micron). More relief than CoWoS (3 suppliers). Expressions: SK Hynix (035420.KS), **Micron (MU, best US-listed)**, Samsung.

### S4 Power delivery / SiC-GaN + 800V HVDC — binds 2027 (Kyber inflection)
Pilots 2026, mass binds 2027, runs through decade. Moat medium-high (Infineon, onsemi, STMicro SiC; Navitas, Power Integrations GaN). EV softness freed SiC capacity now absorbed by AI. Expressions: Navitas (NVTS, NVIDIA partner), Infineon (IFX), Vertiv (VRT), Monolithic Power (MPWR), onsemi.

### S5 Optical interconnect / co-packaged optics — binds 2027–2030 (next big one) ⭐
Copper hits reach/power wall; scale-up goes optical. Lasers/EML, photonic integration, fiber-attach precision become the chokepoint. Scale-out CPO 2026–2027; scale-up optical 2028–2030; >35% penetration by 2030. NVIDIA's $4B pre-buy signals scarcity. Moat high at laser/EML layer (Coherent, Lumentum, Broadcom CPO + TSMC COUPE). Substitution: LPO/linear-drive + copper persistence delay full optical. Expressions: Coherent (COHR), Lumentum (LITE), Broadcom (AVGO), Fabrinet (FN), TSMC (COUPE).

### S6 Specialty materials & consumables — intermittent, geopolitically fragile ⭐ (most under-priced)
ABF substrate (FC-BGA, Ajinomoto monopoly on film; T-glass cloth shortage peaks 2026); EUV photoresist (~6-mo inventory, naphtha-feedstock exposed — the cited Mar–Apr 2026 Hormuz disruption hit Samsung/SK Hynix); e-gases/targets (neon, C4F6). Binds in spikes; structurally tight through 2027. Near-monopoly chemistry IP. Expressions: Ajinomoto, Ibiden, Shinko, AT&S, Shin-Etsu, JSR, Tokyo Ohka.

### S7 Cooling, metrology/test, skilled packaging labor — rising, services-side
Liquid cooling (CDU/cold plate) DLC +156% YoY 2Q25, ~$6B by 2029, but commoditizing (Dell'Oro flags CDU saturation). Metrology (KLA near-monopoly in packaging inspection) + skilled packaging technicians (short ~17–20k engineers + ~17k technicians/yr) are quieter binding constraints. Expressions: Vertiv (VRT), KLA (KLAC).

## 4. Non-consensus (where scarcity migrates next)
1. **DRAM wafer opportunity cost from HBM** → broad memory squeeze (DDR5/server/consumer) through 2027 (highest-conviction non-consensus). 2. Silicon→glass/panel interposer (CoPoS) transition ~2028 (SCHMID, SEMCO, Absolics/SKC, Corning). 3. ABF film + T-glass + EUV photoresist single-supplier fragility (spikes 2026–2027). 4. SoIC capital intensity as throughput governor (2027–2029). 5. Optical lasers/EML + fiber-attach scale-up bottleneck (2028–2030). 6. SiC/GaN for 800V HVDC (Kyber 2027). 7. Packaging metrology + skilled labor ceiling.

## 5. Confidence & the dominant macro risk
Sequence HIGH confidence; absolute dates MEDIUM (6–18mo slips normal). **AI capex digestion is the dominant risk:** hyperscaler capex ~$256B (2024) → ~$443B (2025) → ~$600–700B (2026), growing ~46% vs revenue (wider than 2001 telecom's 32% divergence); AI assets depreciate ~20%/yr → ~$400B annual depreciation > combined 2025 profits; first GPU-backed debt maturities 2026–2027. A digestion air-pocket most likely **2027–2028** could simultaneously un-bind CoWoS, HBM, substrates — the scarcity-investor's main tail risk. Mitigant: contracted/staged builds + physical (power) limits cushion a hard crash.

## 6. Sources
CoWoS/packaging: digitimes.com (a20251210PD218; a20251215PD204) · trendforce.com 2025/12/08 (CoWoS booked) · financialcontent (130k). HBM: trendforce.com 2026/01/23 (HBM4E) · tomshardware.com (HBM roadmaps; HBM eating RAM) · introl.com (supercycle). Litho: trendforce.com 2026/02/16 (High-NA) · sec.gov ASML 6-K. Nodes: tomshardware.com (TSMC roadmap A14/A16) · cloudnews.tech (N2 sold out). ASIC: tomshardware.com (custom ASIC) · fool.com/2026/05/25 (Goldman) · bloomberg.com (BI $600B). Substrates/materials: digitimes.com (a20251218PD207 ABF) · nikhs.substack.com (ABF) · en.sedaily.com + digitimes.com (photoresist/Hormuz). Hybrid bonding/SoIC: trendforce.com 2026/03/18 (SoIC Rubin) · semiengineering.com. Glass/panel: trendforce.com 2026/05/19 (SCHMID) + insights.trendforce.com (glass substrate). CPO/optics: tomshardware.com (NVIDIA silicon photonics) · io-fund.com (NVIDIA $4B) · idtechex.com (CPO). Networking: hpcwire.com (UALink) · 650group.com (Ethernet scale-up). Power: powerelectronicsnews.com (NVIDIA/Infineon) · insights.trendforce.com (SiC/GaN) · sec.gov Navitas. Cooling/labor: delloro.com (CDU) · blog.se.com (D2C) · sourceability.com (talent). Capex/bubble: datacenterknowledge.com ($700B) · allianz.com (capex special) · longyield.substack.com. NVIDIA roadmap: tomshardware.com (Rubin/Feynman) · nextplatform.com.
