import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeLog } from './recorder.js';
import { replayLog } from './replay.js';
import { SIM_VERSION } from './sim-version.js';

// Runs of Good Lift as their challenge links, each with the sheet a browser came to for it: four
// flown in Chromium on keys alone (one of them down out of the launch column with the big ears, E,
// opened again by the brake), and twelve flown in Node by the reference pilots at the keys (with
// kettlebells and close calls, the Beast, a blessing taken and a bell turned aside by Algiz, plates
// off the sky, doubled lifts and climbs to 1,500 m, TST pulling its ears out of lift, and a pilot
// that never catches its wing, which tucks) that Chromium replayed to the same sheets
// (.artifacts/flight-qa/golden-qa.mjs does both, and node-goldens.mjs beside it records the Node
// ones). All are SIM_VERSION 4's. Replayed here they must come to the very same sheet: if one does
// not, either how a run flies has changed without a new SIM_VERSION, or Node's maths and the
// browser's part ways, and every link shared would replay differently from how it was flown. Record
// them afresh with each new SIM_VERSION.
const GOLDEN = Object.freeze([
  {
    name: "column, eased", engine: "chromium 143.0.7499.4",
    link: "AQRKOywdAAAAAAAUogKlItAa0kO2CZJElgmS4QGwHqFw",
    reason: 'fog', steps: 4389, total: 50, peak: 290, lights: [0, 0],
    stats: { strikes: 0, stalls: 0, cloud: 0, reps: 0, deep: 0, trails: 1, wind: 0, thunder: 0, bait: 0, close: 0, scattered: 0, recovered: 0, thrown: 0, dodged: 0, hits: 0, glanced: 0, beast: 0, gates: 0, runes: 0 },
  },
  {
    name: "column, the other way", engine: "chromium 143.0.7499.4",
    link: "AQTu_8AAAAAAAAAWtAKSJMAZkawCkrwBmC6yEg",
    reason: 'fog', steps: 4626, total: 55, peak: 308, lights: [0, 0],
    stats: { strikes: 0, stalls: 0, cloud: 0, reps: 0, deep: 0, trails: 1, wind: 0, thunder: 0, bait: 0, close: 0, scattered: 0, recovered: 0, thrown: 0, dodged: 0, hits: 0, glanced: 0, beast: 0, gates: 0, runes: 0 },
  },
  {
    name: "on the bar", engine: "chromium 143.0.7499.4",
    link: "AQQDAO1eAAAAAAAKadoB8AG4GQ",
    reason: 'landed', steps: 217, total: 25, peak: 105, lights: [0],
    stats: { strikes: 0, stalls: 0, cloud: 0, reps: 0, deep: 0, trails: 0, wind: 0, thunder: 0, bait: 0, close: 0, scattered: 0, recovered: 0, thrown: 0, dodged: 0, hits: 0, glanced: 0, beast: 0, gates: 0, runes: 0 },
  },
  {
    name: "big ears", engine: "chromium 143.0.7499.4",
    link: "AQQEAO1eAAAAAAAKsAKfHtAakuEBwBfcHo0XxATBlgE",
    reason: 'quit', steps: 3871, total: 25, peak: 304, lights: [0],
    stats: { strikes: 0, stalls: 0, cloud: 0, reps: 0, deep: 0, trails: 2, wind: 0, thunder: 0, bait: 0, close: 0, scattered: 0, recovered: 0, thrown: 0, dodged: 0, hits: 0, glanced: 0, beast: 0, gates: 0, runes: 0 },
  },
  {
    name: "TST at the keys, sky 3", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQDAAAAAAAAAABSqQqIRdAGxQWEBsYB1AK2AeQBtgGkAaYBhAG2AWSGAURmJDYkViRGJFYkViRmNKYBNJYBJFYklgEkdiSWASSGARQmFIYBJMYBJKYBJPYBJPYBFEYUlgIU5gEU1gHCAYYUlAH2AmSGAlTWAUSWATSGATSWAUTWAUTWAUSWAjSGAiTWDsIB5g-kA9YC1AHGAYQBhgF0lgGEAaYBZGY0RjRWNGY0ViRWJGYkhgEkhgeCE-Ab1gfkA5UClAPVAbQBtQF0tQFUxQE0lQEkxQEkxRNktQJU5QFElQE0hQFEJcEBtQJU5QFExQE0xQE0hQIktQIUxRyEA5UD9AR1xAHyGdAHMfADIZADIcACETAR0AERUBGQASGAAjGAAiFgEYUJtALGBfQB9gRE9g_KEJYQtAN19AW2BoQBxgckhgUk9gEktgEklgEkZiR2JEYUJhQ2JGY0dhQwkgHmAXSWAVRmVHZUVkRW0AYxoA0R0AMRgAIRsAMR8AIRoAMRkAQR0AUR0AUR8AQR4AQRkAPCD6EXwAdCoAQisAIi4AIisAIisAIioAIyMIYG1Ag19AYlhAEVVBVkJbQBJVQVJBVUJWQlVCVUJUQlRBUUFTQlRCU0JUQlJBUkJUQ1RDVENURFJJAB8QHVAmHVApEDtRLkArUElAGVAmTVAVSlAUR1NFU0dURlJCUkVTRVNFVEhQFUdURlRGU0RSQVgQPVAmHVApED5RLUArUFdKUCRJUBNGUkVTR1NEUkRTRVNEU0RTRFRFVUZXR1hAFlhAFlNNEZoAZi8AQykAIi0AEiwAEisAEiwAEysAIygAIigAESQBJgEkASYCKwASKAASKQASJANOUD9Aa2ApQC1gGUAaYBdJYBZHY0JhQmJEY0RiQmFBYUJhQWFBYaGIoV5g-UA5UBpAWGBoQBtgQ0pgMk5gEk9gEklgEkpgEkhgEkZiSGASRGFDYUNiR2JEYkZiRGJFYkNiIgggG2AmSGAmSmAlSmAjSGAiSGC_oQtgLSHuAHMaAEIeADEXARsAIRsAER0AERMBGQASGgASGgASGgAREgEYABIcABIYABETARcCHAASFwEUARYCHAATGAAjHAASGAASGgAREQEZABIbABIbABIdABIfABIaAB",
    reason: 'fog', steps: 8840, total: 205, peak: 1321, lights: [0, 0, 0, 1, 5, 0],
    stats: { strikes: 2, stalls: 0, cloud: 11, reps: 3, deep: 3, trails: 5, wind: 2, thunder: 0, bait: 0, close: 0, scattered: 2, recovered: 1, thrown: 4, dodged: 4, hits: 0, glanced: 0, beast: 3, gates: 0, runes: 0 },
  },
  {
    name: "TST at the keys, sky 5", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQFAAAAAAAAAAAotwfdQNAGxQWEBsYB1AK2AeQBtgGkAaYBhAG2AWSGAVSmAURmJEYkZjSWATSGATS2ATTGATTWATSmAjTmAiSGAiTmAyTmAySmAcIB1ghk1gJElgI01gE0pgI0pgMkxh2kAuYCEpABIoYDpAGGAnTWAVSmAUSmATSWASSGASTWARS2ARSmHJEJ8AZC4AMisAIi0AIioAIioAIi8AESQBKgARJQEqABIoACMsACInAi4AEykAIygAK2B4QFpQG0A4UB5AFlhAFVdGWEAYUBdHVUdVSVAUSVATR1FCUUZSSVAiSVFMEB9QTkAdUChAG1AURVJEU0dTRVJEUkVSRVNKUBROUBNMUBJOUBJMUagQPVAmHVApED5QjkBoUEtAGFEYAp4RvgQLIMgAgxwg-hFoA_pgO0ErUB5AKVAYQClQHkAZUBxAGVARSAA4QB1QFh1QKRA-UQtAHVBkSVAzTFASR1JIUBJGUkZSRlNJUBNFUkVSQ1FCUUJRQlFDUkZTRFNDUkNURlZGVUVURFRFVUZURFJCUUFRQlFCUkVSRVJHUkwQHFHaQD1QL0AcUBpAF1dGV0ZYQBdZQBdYQBVVRFVCmYEdBh0RKQCyLgBRKAAhKAA6EPkhrwC7YG1Aa1AeQClQG0AYUBhAF1VIED1QJR",
    reason: 'fog', steps: 8285, total: 100, peak: 951, lights: [0, 0, 1, 1],
    stats: { strikes: 3, stalls: 0, cloud: 0, reps: 2, deep: 2, trails: 3, wind: 0, thunder: 0, bait: 0, close: 0, scattered: 2, recovered: 0, thrown: 3, dodged: 3, hits: 0, glanced: 0, beast: 0, gates: 0, runes: 0 },
  },
  {
    name: "TST at the keys, sky 10", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQKAAAAAAAAAABkrQvGRtAGxQWEBsYB1AK2AeQBtgGkAaYBhAG2AWSGAVSmAUR2NGYkRhQmFDYUJhRGFCYURhQmFFYkhgEkhgEkdhQ2FHYkxgEUFhS2ARRGFLYBFIYBFOYBFJYCFKYEFKYBwgHGDIQBlgNk1gJUpgJElgIkZhR2FIYBFNYBFJYbwgGWAaQBhgJ0tgFUdjRWNFY0ZkSGATRGNIYBRIYBNGYkViRmFBYUZiS2ASSGAhSmFsEJsAdC8AMyoAMisAEi8AEisAEikAFEhQTEBqYChALmAZQBtgFklgFEZjRmNGY0ZjRmNHZElgFUpgFEZjRmNEYUFhQmFCYUFhQ2FBYUJhQmJFY0VjRmRHZEdjRGJDYUFhQ2JEYkRiRGJEYkViRGJGY0lgEkRiSmATSGAhIgkgHGEYID1gJi1gKSA5YPpARFtAfmA4QC5gKEAZYDRKYQggPWAmLWAoIOoEzVAqQThgP0AoAD1AJg1ALwAUFgpAPWIJQC1gLEAdYBpAGGAWRWZFY08RDZDcgCgAPFBvQClgSkAoYEZIYDNMYCJOYBFDYUtgEk1gE0hgI0lgEkZiR2JFYkdjSGATSGAUSmAUSGATRmNHY0ZjSGAUSmAUSmATRmFBYUViRWQiBixiGUAvYClAHWAXTGAWSmAURWJDYkRiRGJEY0hgFEpgFEtgEkVhR2FIYBwgHmHfQJtgKUA5YB4gqaAcgISYgEKYgCKdgCKZgCKegBMBFAEfABEZABEeABEZABEdABIaADIZACIdACIYACEUARwAERUBGwASGgAiHwAREgETC1BoQHdtQCZvQBZsQBVmQYejiKDxaKAbYTpAmmBJQCxgK0AeYBhAG2AXSmAWSWAWSmAXTGAXS2AVSGAUSGAUQ2wgHWASR2JLYBJMYBJPYCFNYO6hCGEZQCtQOEB-YBpALGAaQBpgFktgFUlgI0hgmCFOAHwQ_SFMAm9QXEAtYD5AWmAZQDVsQCNuQCJqQCJoQB",
    reason: 'fog', steps: 9030, total: 250, peak: 1453, lights: [0, 0, 1, 0, 4, 0],
    stats: { strikes: 3, stalls: 0, cloud: 4, reps: 5, deep: 5, trails: 5, wind: 0, thunder: 0, bait: 0, close: 1, scattered: 2, recovered: 1, thrown: 5, dodged: 4, hits: 0, glanced: 0, beast: 3, gates: 0, runes: 0 },
  },
  {
    name: "TST at the keys, sky 21", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQVAAAAAAAAAABgtQqpRfECogNAFKUFhAfWAcQCpgGkAYYBhAGGAWR2VHZEZkSGAUR2NHY0djSWATSGASRWFCYUVhQmFGYklgEkhgEkpgEklgEktgEkpgEkxgEkxgEk1gEk5gEk9gEUVhRmwgHmGmTmAkTGATSmATSmATSWATSWATSWASRGJJYBNKYBNMYBJGYURhR2FGYUtgEU9gbCAcYV5ALWAsQBxgGEAYYBZGZERkRmZIYBdJYBZIYBVHZEhgFElgEkRiQWYPECgBNBgAMx8AIhENUGhAaWAaQDhgGEAmaEAUZUNkQ2VEZENjQmJCYkJiQ2RFZERiQWFDYkJhQWFDYkNiRWNGYkRiRmJHYklgEkxgEUhgEUlg_CAdYKhALmApQBhgJ05gFk9gFU5gFElgI05gIU1hnCAfYCtALWAaQClgGEAlaEATZ0NnRGlAFWhAFWZFZkVkRGREYkFhQmFBYUFhQmFBYUJhQWFCYUJiRWJDYUJtIPOpgMKcgDMCGwBRGgAhGQAxGwAhHAAhGAAhGgAhHQARGAAiHQAyGwAhFAEcABEWARoAEhgAKVCIQDlgPkAtYCpAG2AoID1gJi1gKSA-YR5AqGA8QC5gG0AZYBdIYBdJYBdLYBZLYBVKYCNPYHwgFGsQQVkRjgDRLwAhLABBLgAxLwAxLwBBLgBRKQBRLwAxKgAxKAAxKAAxLQAhLQAhLAAhLgAdEClQ2mAYIFFvIY0ALFB6QFlgGUA3bkAVZ0RnRWdFZUNiQmNEZEVkRWNEYkRjSGATR2FBYUdiSmAiSWFMIBxgXUAsYCtAHGATRIqg_2E8QH1gT0AaYCpAHGAYQBhgFkVkRGRDY0FoEN0AgykAUi0AMi0AMioAMigAMi4AIiwAIisAIikAIigAIi8AEi0AEi0AEiwAEioAEisAEikAEikAEikAEigAEioAFUhQPUCZYCpALGAVRoyhSWD4QDpQHUBcYFlAH2BST2AySWAzS2AkSWAlT2AVSmATRWNHY0JkIgYvYBVJYBNEYkZjRmJEYkZjSmAUT2ATT2ASTGHrQD5gLkAcYBlAF2VCYyQFKWAWR2VGZERiQ2NFY0VjRmNIYBNLYBJMYGQJEEgBhBsAMhoAERUBGgASHwASHAASHAASGwATGwAUGQAUGwAUGQATFwMYABMYABMUDFBsQB",
    reason: 'fog', steps: 8873, total: 240, peak: 1333, lights: [0, 0, 0, 5, 0, 4],
    stats: { strikes: 1, stalls: 0, cloud: 13, reps: 4, deep: 4, trails: 5, wind: 0, thunder: 0, bait: 0, close: 0, scattered: 2, recovered: 1, thrown: 4, dodged: 4, hits: 0, glanced: 0, beast: 3, gates: 0, runes: 0 },
  },
  {
    name: "TST at the keys, sky 33", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQhAAAAAAAAAAB90QvwRtAGxQWEBsYB1AK2AeQBtgGkAaYBhAG2AWSGAURmNHZEpgFElgE0hgE0pgE0lgEkZiSWASSGARQmFHYk1gEktgEklgIk1gIUxgEUhgXCAfYPpAGWA3SGAlTWAVTmAUSmATSmATTWASR2FGYUpgEUhhXCAbYJpAPmAvQB9gGkAaYBdIYBVGY0NiRGNGY0ViRGJGYkdiSmARSmARTGDMIB4AVBgBURoAQR4AMR0AIR4AGVCMQCpgX0AfYDZLYDRMYCNNYBNNYBNJYBNLYBRLYBRJYBRJYBNEYkVjR2RIYBRHZEhgE0RiRGJEYkRiRWNIYBNHY0lgEkVhQQsgHGH9QChgPUAYYCpAHWAXSWAVR2RHY0RiRGJFY0hgE0hgEkViS2ASSWASIQkgGGEuoR1gSSAsEI0Agi0AMS4AIS8AIS4AIS4AISwAIS0AIS0AISsAISwAISsAISoAISwAISgAISwAIS8AESsAISgAISgAISkAIS8AESgAIS8AES8AES4AES8AES0AEi8AISUBKQAhKgARLwARLQARLgARKAAhLwARKAAhLwARLQARLwARKwARLwARKgARLgARLAARLAARL2BSTIBrkIhQmkAYADFMUCYdUCkQOFCvEBsAoSkBQUlQXkBaYChAKGAnTmATSWASTmASTmBRRmggPWAmLWApIDhg_kDJYE1AHmAlSWAyS2EcIBlgnUCqYB5AJ2xAFWdEZ0VoQBVnRWZEZENkQ2NDZENiQWFBYUFhQWFBYkNjQ2NDY0RkRWNDY4mhKJAhXpBdEKkDjGBPQJpQHkAoUB1AFllAFVdFV0VWRVdHWEAXV0dWR1ZHVUdVSFAVSVAUR1NHUkRSSFASR1JLUBJIUCFNUCFOUDwQH1D4ED1QJh1QKRA8UN5AXFBIQB9RfEAbUClAHFAYQBlQE0QIEBpQF0dWRlVEU0NTQ1NEVERRQ4mQy4BfAGQuADMvACIrABEmASgAEioAIywAIykAIicBJQElASUBJgElASUBJgElASIFTVArQNlgLEArYBxAGWAbQBlgGUAXZ0doQBhgF0dnSGAWR2ZIYBVHZEViQmFCYUJhQmJGY0djSWATS2ATS2AiS2BMIBJpoQ9gKCGzSFBQ",
    reason: 'fog', steps: 9072, total: 312.5, peak: 1489, lights: [0, 0, 0, 1, 1, 4],
    stats: { strikes: 3, stalls: 0, cloud: 2, reps: 5, deep: 4, trails: 5, wind: 2, thunder: 0, bait: 0, close: 0, scattered: 3, recovered: 3, thrown: 5, dodged: 5, hits: 0, glanced: 0, beast: 3, gates: 0, runes: 0 },
  },
  {
    name: "TST at the keys, sky 35", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQjAAAAAAAAAABS-gqFRtEBkAKiAdABFKUE5An2AYQCpgGUAYYBZGZEZlSGAURmNFY0djR2NHY0lgE0hgEkViSWATTGASRWFEYUVhRGFGYUVhRWFHYUVhSGARRmFKYBFIYBFMYBFNYBFIYDFGbCAbYRhAHWA1SGAkT2ATSmASRmFDYUZiS2ASSmASTWASSmAiT2EsIB5gukAqYDpAGWAnTGAVTGAVTmATR2JKYBJOYBFMYOoQ6wB6YGhASlAsQCxQGkAaUBdIUBZKUBdMUBZJUBRGU0ZTRlNFU0dTRVJDUkVSQ1FBUURTR1NGU0ZTR1NFUkVSRFJFUkVSRVJGU0pQEkNRRFFDUUVRQlFIUBJMUBJJUCERChAcUYtAH1AnT1AVTFAUSFASRFJGVERVRFRCUkJTQlNDVUVXRlZGVUlQFUpQnBAdUWxAWxCJkR0QnwCDLwAyKwAhJQEsABEnASoAEi5geUA4UD5AK1AqQBxQJk5QI0lQIkxQIk5QIkhQIktQEktQE05QE0lQE0lQE0lQFEtQFUxQFUtQFUtQFEhQE0ZRQVFFEQYeUDRPUh5ATiCbAFYaAEIaABEXARkAERcBFwEYABEWARgAERUBGAARFAEZABIdABIZABIcABIcIEpgsloSLwBlLABLYGtAZ1lANVxAFFlAE1VCVUNWQ1VCU0JTQlRDVUgQPVAmHVApEDtQ_UAeUIRJUDRLUCRNUBNHU0pQFElQFElQE0RSRFFBUUJRQ1JEUkNRQlJFUkJRQ1JEUkRSQ1FCUUJRQlFCUUNSRlNIUBNIUBNLUBJHUgoQH1BvkSFfkH8RygCiLABiKwBxLAAhLwAxKQAxLwASKwAyKQAxJwEpACErABEvABEsABEuABEtABEvABEuABEpACErACEuACEqADEqADEpADEvACEoADEvACEvACEnCRBuUH9gHlEJEVRZQCxgOUDvUBxAK1AbQBlQGEAXXkAXV0dVSVATTlFMEBlQ7UAkaCA9YCYtYCkgOmCRTFC9IF8CiWBirIBakJpQ20A-UFdMUFRJUENOUBJKUBJJUBJJUBJFU",
    reason: 'fog', steps: 8965, total: 205, peak: 1402, lights: [0, 0, 0, 0, 1, 5],
    stats: { strikes: 2, stalls: 0, cloud: 4, reps: 4, deep: 4, trails: 5, wind: 0, thunder: 1, bait: 1, close: 2, scattered: 0, recovered: 0, thrown: 5, dodged: 3, hits: 0, glanced: 0, beast: 3, gates: 1, runes: 4 },
  },
  {
    name: "collector at the keys, sky 4", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQEAAAAAAAAAACaAa8H3UDQBsUFhAbGAdQCtgHkAbYBpAGmAYQBtgFkhgFUpgFEdjRmJFYkViRmJGYkdiR2JIYBJIYBFCYUdhQ2FIYBJPYBJNYBFFYU5gEUtgEUpgIUhgMUpgHCAdYMdLYDROYBJHYk1gE0tgI0hgMklh1yUDS2A2TGAUSWASQ2JIYBNIYBNJYBNKYBNLYBNPYBNJYDFMYWmhOJF8oNuAeaAekFyATFBrQCpgXUAYYC5AG2AfQBlgGEAmbEAVaEAlbEAkaUAjakASZkJnQ2JIAD1AJglAJGkgO2CrQBxg3CB9AK4gGWFvQCxQLkApok6Rn4AfYQVKUb1AblArQClQFBgAEklQHZAagJ2gj4A6kI-gioBUnIAmn4AUk4qg_JIJgH6gP2BeQChQL0DNYBtAKmAbQBhgF0ZmR2ZIYBVGY0RiRGJEYkRiRmJEYUNhQ2FEYUViTmASSGAxTGB8IB5g-kAoYDpAHmAXTGAWRmig-CA9YCYtYCgiJW1AKlAoQEiQWYBIoBqRLoAzq2BYID1gJi1gJCYPEB9R60FoUBlAJVVEBxEGRVZDU0JTQlNDVURUQ1RDU0NURFRDUkJTRFRDUZOKkP9RK0CYUF5AHVApQB9QFkhQE0NRQVFDUkNSRFNFU0RTRVNEVEdWSFAWR1VFU0NTQlujLZEeUM",
    reason: 'fog', steps: 8285, total: 385, peak: 943, lights: [0, 1, 4, 1],
    stats: { strikes: 3, stalls: 0, cloud: 5, reps: 2, deep: 1, trails: 5, wind: 1, thunder: 0, bait: 0, close: 0, scattered: 0, recovered: 0, thrown: 3, dodged: 3, hits: 0, glanced: 0, beast: 0, gates: 1, runes: 8 },
  },
  {
    name: "collector at the keys, sky 12", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQMAAAAAAAAAADAAY8JhUPQBsUFhAbGAdQCtgHkAbYBpAGmAYQBtgFkhgFUpgFEdjR2NJYBRNYBROYBNKYBJHYUNhR2FDYUhgEk5gE01gI0pgIkpgEURhSWARRmFGYUhgEUVhIQogHGCTTGG5QB9gJk9gFU1gFElgEkRiR2JGYkZiSWATTmATSGAjIgcoYchALWAqQBxgF0hgFkdlRmVGZUZlRGigqoBIkN2gX4DmnYFeYHpAK1BMQDtQKEAuUBpAGlAXSFAWSFAVR1VIUBRGU0VSQ1FCUkZSRFJGUkZSR1JJUBJNUBJJUB0g6WGcQBtgZEpRfxCJUC1AK2AsQJJuQLlQLWBZIFqiuIC6oB6RiIBWKGC7QBlQ2BA9UCYdUCkQP1DtQKpQOEAoUChAHFAVS1AUTVATSVAiTFD8EBlQyEA4UD5AHFAYQCdbQBZcQBZaQBdZQBlQFk9RfBAbUKhAfVArQC5QHEAbUBpAG1AYQBlQFUVSQlFCUkRSRFNHU0dSRFJJUBJHUUZRSlARSVDsEBpQTpEJUNxAHmBtQKuhrpDnjKAugDogIghgWkBPUB1AO1AYQClQHEAYUBpAF1hAFldFVURVRFRDU0NUQ1JBUUJURVZGVkVURFRFVUVTQlFBUUJSipEKUV1Az1A8QClQLEAbUBhAGFAXSFAWRlVGVERTQ1JDU0VVSFAVQQsQGVAUSFAUSFATRlJEUkdSR1JKUBJNUKqgkW-iLoBskByAR5mAJ56AGJAagBuQqqMA",
    reason: 'fog', steps: 8581, total: 480, peak: 1167, lights: [0, 0, 5, 0, 0],
    stats: { strikes: 1, stalls: 0, cloud: 14, reps: 4, deep: 4, trails: 4, wind: 3, thunder: 1, bait: 0, close: 0, scattered: 2, recovered: 2, thrown: 4, dodged: 4, hits: 0, glanced: 0, beast: 3, gates: 1, runes: 1 },
  },
  {
    name: "holding its line at the keys, sky 7", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQHAAAAAAAAAACQAeEL-kbQBsUFhAbGAdQCtgHkAbYBpAGmAYQBtgFkhgFUpgFEdjR2NJYBRNYBNHYUFhR2JJYBJIYBFDYUZhRWFGYUVhR2FGYUZhR2FGYUhgEUVhSWASSGAiS2AST2ARQQsgG2CESWHrQB1gJ05gFUpgFEhgE0djR2NJYBRNYBRNYBJBbCAYYf1ALGAtQBxgGkAZYBlAGGAXRWRDY0NuIHkAdBgAQhsAIh4AIhoAIhsAIhgAIhgAIh8AEh4AERMBGgARFgEYABVNYCxA6lAsQCxQHEAYUBdGVkZXSFAXRlREU0RURVRGVERSQ1JDUkNSRFJDUkVTRlJEUkZTS1AUTFAjSVB8EBlRTUAnWBA9UCYdUCkQOVDcQFpSGEA-YBhAHAAfQDZtQCghiABoEBoARx1QJh1QKRA4UDxAGWF6QBtgN0hgJUpgFEdiQmFCYUNiRGJDYkVjRWJCYUJhQmJEYkNiQ2FBYUJhQmJEYkNiRGNGZEhgFEdjRWJFYkRhQWFFYUFhQmUhBitiCkAuYCtAHWAXR2EpAB4gHWAmJ25QHxFpAJIuAEEuACEpADEvACEvACEtACEuACEsACEsACErACEqACEqACEqACEoACEoACEoACEvABEvABEuABEuAD1AJgJLUCoQqwBoIBoARC8AIygAHGBuQHhQGUA3XkAWWkAVV0VXRVZFVUVURFRGVUhQFUlQFElQE0hQEkZRRFFGUUhQEU9QEUhQ7BAcUJxAGFA3TlAUSFATSVATSVATS1ASRlFEUUZRSFARSVARSVHVTAAST1A9QBhQKUAdUBdMUBZLUBVEVERVRlZIUBRHUUFRT1FaEQkA8S8AUSkAYSwAfUAlAR1QLxC9AMIpACVNUC5BLmAtQC9gHUAcYBlAGmAWR2RGY0RiRGJEYUFhQ2FCYUNiSGASRWJLYBJNYBFJYBFIYJwgGWEtQEhgOUAqYCtAHWAWSWAUR2NHYkRiSGASRmJNYBJIYCFOYMwgG2DvQC5gLkAdYBlAGWAYQBlgF0dlRmVHZUdkR2RKYBRJYCNKYC8gKQB0HQBxFQEZADIfADMfACIZABIfABMaACIXAh4AEhoAEh0AEh0AEh4AERMBHAARFgEbABEZABEZABEaABEZABEYABEZABEXARkAEhoAIhwAERMBGQARFAEYABEVARYBFQEWARQBFwETARgAEhwAEhcFSGAQ",
    reason: 'fog', steps: 9082, total: 360, peak: 1505, lights: [0, 0, 1, 1, 1, 0, 0],
    stats: { strikes: 5, stalls: 0, cloud: 0, reps: 7, deep: 7, trails: 5, wind: 2, thunder: 0, bait: 0, close: 1, scattered: 6, recovered: 1, thrown: 6, dodged: 1, hits: 3, glanced: 0, beast: 2, gates: 0, runes: 0 },
  },
  {
    name: "holding its line and taking Algiz at the keys, sky 1", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQBAAAAAAAAAABgwwrmRNAGxQWEBsYB1AK2AeQBtgGkAaYBhAG2AWSGAVSmAURmJEYkZjSGASQ2FEYkhgE0tgEkRhRWFDYUZiTWATTWAjTWAySmBxSGAcIBpgyUAeYCVKYBNIYBNJYBNJYBNJYBNMYBNLYBFBYUpgEkphzCAfYC5ALGAtQBxgGUAZYBdIYBdJYBdJYBZIYBRGZEpgFEpgEkhgEkxhOSDpBEMuADItACElASgAEioAEi4AEi4AEi8AEi4AESQBKwARJwEqABEpABEsABErABEuABEtABEvABEtABEsABEtABEsABEsABEsABEkD2BdQHVbQCReQBRcQBRaQBRZQBRYQBRYQBRWQ1RCU0JURFdFVkRUQ1NCUkJSQlNEVERTQ1JCUUFRQVFDU0VTRFJEUkVTSVATSlASTFASSlAuIO1hekAyXGBmSlF8EBRbQStQGEA3X0AVW0AVXUAWXkAWU04BKBHdAiEoAFEuADEsABNPUEpAXWAoQC5gKEAcYDRMYDNOYCNJYCNMYBNKYBNJYBRLYBRIYBNFY0dkR2NEY0dlSWAVR2RHZEZjRWJDYkRiRWNHY0ZiIgggG2IaQD5gL0AeYBtAFWlAFGtAFGpAE2dDaEATZUJkQmNCY0JjQ2NDY0FmIQUuYhhAXmApQC5gGkAZYBdHZUZlR2ZIYBREY0VjRWNBZSIFKWAlT2AUSmAjT2HfQB5gKUAfYBdMYBZKYBRGY0dkSWAUSWATR2JEYUFjIQggH2FJEc0Bz2ArQNpQK0AtUB1AGlAZQBdWRlZGVkdXR1ZGVUZWR1ZHVkhQFkdVR1VIUBVJUBRHU0dSRFFDUURRRVJPUBFHUUhQHBAeUYxAKFA7QB1QF0hQFUdVR1VHVUdVR1RFVEhQFUhQFElQFEpQE01QEklQHiCpAjsQHVAmHVAqEN4AoioAQSgAIS4AISoAISsAISoAISkAISgAISkAIS8AES4AESYLEB8gLgDWU",
    reason: 'fog', steps: 8806, total: 240, peak: 1347, lights: [0, 0, 4, 0, 0, 5],
    stats: { strikes: 1, stalls: 0, cloud: 15, reps: 5, deep: 5, trails: 4, wind: 1, thunder: 0, bait: 0, close: 1, scattered: 1, recovered: 0, thrown: 4, dodged: 1, hits: 1, glanced: 1, beast: 3, gates: 1, runes: 2 },
  },
  {
    name: "TST pulling its ears out of lift at the keys, sky 8", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQIAAAAAAAAAAC4AY0LlkbQBsUFhAbGAdQCtgHkAbYBpAGmAYQBtgFkhgFEZiQ2JFYkRiRWJGY0lgE0lgE0pgEkViSmATTWASRWFFYUViTWASSWASTWASTWAST2ASTWAiT2AcIBthaUAZYDZPYBVMYBNFYkViRWFBYURiRmNJYBNIYBNJYBNKYBJGYktgEk1gEUdhSGCsIB5hK0A8YC1AGmAXRWNCYkJiQ2RFZURiQWFBYUJjRGRFZUZkRGJCYkRjRWNFY0hgE0hgEktgEUZsIKoAgxsAUh0AMRgAERkAIRoAER0AERoAERsAERoAERgAERoAEhwAIx0AIxgAIxwAE09gP0BqUC9AHFAYQBlQFUdURVJDUkRTR1RGUkJRQ1JDUUFRQ1FBUUNSRFNHVEdUR1RHVUlQFUhQFUhQFEVTRVNFU0VTRVNFUkNSRFJEUkRSRFJFUkRSR1NJUBJGUkpQEkpQHBAZUbpAL1ArQBhQKEAcUBZIUBNDUUJSRVNGU0VSRFJEUkVSRFJGUkVSR1JGUkpQEk1QEUhQEU9QHBAcUP0gYW4hR6mA_AB9UDlATGAtQDtgHEAnb0AUZ0JlQmVCZkJlQmZCZEJmQmNBY0JlQ2dDZEJjQWFBYkFiQmRDZURmRWdFZUVmRWVFZERkRWRFY0NiQ2JDYUFhQWFDYUFhQmFCYUJhQ2JFYkViR2JHYktgEkVsIB9hiEAtYClAGmAWSGAWR2VFY0NjRGRFZEVlRmVGZUVuID4AwRkAIRgAQRoAMRsAMRkAMRkAMRgAMRgAMR4AIRkAIRwAERoAIR4AERoAIR8AERoAF8HZwCHdwBHcwBHfwBHbwBHewBHawBHewBLbwDLcwCHVwdHOABEZABEeABEUDCD7EQ_QvMB-AHpgbUB3W0AlXEAVW0AVWEAUVkNUQ1RCUkFRQVFBUkFRQlREVUVVRVVGVUZURVNFU0VTR1RLUBNHUkpQEkxQEUpQEUhQzBAcUNxAKVA7QB9QF0ZckQxRSkA4YB1AbFA6QClQK0AcUBhAGVAWSFAVRlRFU0NRQVFCUkRTRFNFU0VUR1RGU0VTQVYSBBtQJU1QE0tQE0xQIkpR-UCqUB5AOFAWTAARSlAYQCdTThHIABuAoquAQayAEa6AIa2AEaWMABEvACEqACEsACEoACEoACEuABEqABLB7MAR6MAR5sHnwQEkAScBJQEnASYBJE9QSEBbYCpAKWApQB5gFkxgFElgE0hgE0hgEkRhQmFDYUNhQ2JHY0hgE0djR2NGY0ZjRmNGY4qg_GEbQHhgakAdYDZIYCRLYBNGYkViRWJEYkViQ2JFYkNiRGNGY0NhQWFCYkRjRGJBYUNjRGNEZEVkRWVCZCQEKmAWRmRFZERjRWVDZk8Q_gBWKACSLwAhKwARKQAhLQARLgARJA",
    reason: 'fog', steps: 8982, total: 460, peak: 1421, lights: [0, 0, 4, 4, 4, 0],
    stats: { strikes: 0, stalls: 0, cloud: 13, reps: 6, deep: 6, trails: 5, wind: 1, thunder: 1, bait: 0, close: 0, scattered: 0, recovered: 0, thrown: 6, dodged: 5, hits: 0, glanced: 0, beast: 3, gates: 0, runes: 0 },
  },
  {
    name: "TST never catching its wing at the keys, sky 2", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQCAAAAAAAAAABmhgeSQNAG8QmAAuIXoAGCBzDyBCDCL_ABwgNwwgJQkgJA0gIw0gIggi6wBMIYsAZRoAUh4AEh0AIREBHgASGQAjHgAjGAAjGAAjHwAcIHoAKhEeABoQSAAdECUPEBMIEBIJEBMIECMPEBMKEDIJEusASxA4ACoQJAwRSQCDKQBhJAEtACIoADIpACIqACItABIvABIrABIsABIqABIpABIpABIoABIoABImAigAEiUBIgEkASIBJAEiASMBIwEjAicDJwIjASIBIgEjAiUCJAMnAyUDJgMlAiMCJAIiDSDcACoQqwAZEKyQ6RKKIEoEURoAeCDtEXMPIL8AHxNOAB4QNw0QJQsQJA4QIwwQMQ0QLJDrEqUMIFkAXBAsIR4AcxwAUhsAQh8AIRMBHgARFgEZABEXARgAERYBGAASGAAjGgAjHwASGAASGwASGAASGgASGAASGAASGQATHQATGQASFQETARMBFAETARQCGQASFQETARQCGgASFgIaABMfABMfABMUCiB4AD0QfwAcEDcIECQKEBMLEBQKEtsAGRCECxAyCRARBhEHEQURCBASDBASCRASCRASCBASCBASCBASBxIIEBIHEgkQEgcSCxASCRARBREKEBGIkQsQGwDELQBCKgARKAASKwAjKAAQ",
    reason: 'fog', steps: 8210, total: 255, peak: 902, lights: [0, 0, 0, 1],
    stats: { strikes: 1, stalls: 0, cloud: 0, reps: 3, deep: 3, trails: 5, wind: 2, thunder: 0, bait: 0, close: 3, scattered: 2, recovered: 0, thrown: 4, dodged: 1, hits: 0, glanced: 0, beast: 0, gates: 0, runes: 0 },
  },
]);

test('runs flown in a browser replay in Node to the very sheet the browser showed', () => {
  assert.equal(GOLDEN.length, 16);
  for (const run of GOLDEN) {
    const read = decodeLog(run.link);
    assert.ok(read.ok, `${run.name}: ${read.why}`);
    assert.equal(read.log.simVersion, SIM_VERSION, `${run.name} was recorded under another SIM_VERSION: record the goldens again`);
    const sheet = replayLog(read.log);
    assert.equal(sheet.reason, run.reason, run.name);
    assert.equal(sheet.steps, run.steps, run.name);
    assert.equal(sheet.total, run.total, run.name);
    assert.equal(sheet.peak, run.peak, run.name);
    assert.deepEqual(sheet.lifts.map((lift) => lift.red), run.lights, `${run.name}: the lights`);
    assert.deepEqual(sheet.stats, run.stats, `${run.name}: the strikes, stalls, cloud and kettlebells`);
  }
});
