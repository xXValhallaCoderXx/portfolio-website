import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeLog } from './recorder.js';
import { replayLog } from './replay.js';
import { SIM_VERSION } from './sim-version.js';

// Runs of Good Lift as their challenge links, each with the sheet a browser came to for it: three
// flown in Chromium on keys alone, and ten flown in Node by the reference pilots at the keys (with
// kettlebells and close calls, the Beast, a blessing taken and a bell turned aside by Algiz, plates
// off the sky, doubled lifts and climbs to 1,500 m) that Chromium replayed to the same sheets
// (.artifacts/flight-qa/golden-qa.mjs does both, and node-goldens.mjs beside it records the Node
// ones). All are SIM_VERSION 3's. Replayed here they must come to the very same sheet: if one does
// not, either how a run flies has changed without a new SIM_VERSION, or Node's maths and the
// browser's part ways, and every link shared would replay differently from how it was flown. Record
// them afresh with each new SIM_VERSION.
const GOLDEN = Object.freeze([
  {
    name: "column, eased", engine: "chromium 143.0.7499.4",
    link: "AQNKOywdAAAAAAAUlgKGIqAd0kO2CfJExgni4QGQH6Fn",
    reason: 'fog', steps: 4358, total: 50, peak: 278, lights: [0, 0],
    stats: { strikes: 0, stalls: 0, cloud: 0, reps: 0, deep: 0, trails: 1, wind: 0, thunder: 0, bait: 0, close: 0, scattered: 0, recovered: 0, thrown: 0, dodged: 0, hits: 0, glanced: 0, beast: 0, gates: 0, runes: 0 },
  },
  {
    name: "column, the other way", engine: "chromium 143.0.7499.4",
    link: "AQPu_8AAAAAAAAAWsgKBJNAa0awC4rsBiC6SDw",
    reason: 'fog', steps: 4609, total: 55, peak: 306, lights: [0, 0],
    stats: { strikes: 0, stalls: 0, cloud: 0, reps: 0, deep: 0, trails: 1, wind: 0, thunder: 0, bait: 0, close: 0, scattered: 0, recovered: 0, thrown: 0, dodged: 0, hits: 0, glanced: 0, beast: 0, gates: 0, runes: 0 },
  },
  {
    name: "on the bar", engine: "chromium 143.0.7499.4",
    link: "AQMDAO1eAAAAAAAKaNEBIPgZ",
    reason: 'landed', steps: 208, total: 25, peak: 104, lights: [0],
    stats: { strikes: 0, stalls: 0, cloud: 0, reps: 0, deep: 0, trails: 0, wind: 0, thunder: 0, bait: 0, close: 0, scattered: 0, recovered: 0, thrown: 0, dodged: 0, hits: 0, glanced: 0, beast: 0, gates: 0, runes: 0 },
  },
  {
    name: "TST at the keys, sky 3", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQMDAAAAAAAAAACKAaoKiUXQBsUFhAbGAdQCtgHkAbYBpAGmAYQBtgFkhgFEZiQ2JFYkRiRWJFYkZjSmATSWASRWJJYBJHYklgEkhgEUJhSGASTGASSmAST2AST2ARRGFJYCFOYBFNYBwgGGFJQB9gJkhgJU1gFElgE0hgE0lgFE1gFE1gFElgI0hgIk1g7CAeYPpAPWAtQBxgGEAYYBdJYBhAGmAWRmNEY0VjRmNFYkViRmJIYBJIYHghPgG9YH5AOVApQD1QG0AbUBdLUBVMUBNJUBJMUBJMUTZLUCVOUBRJUBNIUBRCXBAbUCVOUBRMUBNMUBNIUCJLUCFMUchAOVA_QEdcQB8hnQBzHwAyGQAyHAAhEwEdABEVARkAEhgAIxgAIhYBGFCbQCxgX0AfYERPYPyhCWELQDdfQFtgaEAcYHJIYFJPYBJLYBJJYBJGYkdiRGFCYUNiRmNHYUMJIB5gF0lgFUZlR2VFZEVtAGMaANEdADEYACEbADEfACEaADEZAEEdAFEdAFEfAEEeAEEZADwg-hF8AHQqAEIrACIuACIrACIrACIqACMjCGBtQINfQGJYQBFVQVZCW0ASVUFSQVVCVkJVQlVCVEJUQVFBU0JUQlNCVEJSQVJCVENUQ1RDVERbQB1SPUBtUDlAK1AqQBtQF0lQFkhQFUZVSFAWR1RFVEVTRFNEU0VURlRGVEdURlRJUBVHVRMEH1BDSVHeQElQL0AbEa4AVi0AQyoAIisAEi4AEioAEiwAEykAIygAIy8AEicBJAElASQBJQEjASYBIwElASQBJAEkT1A5QGlgKkAuYBtAHGAZQBtgFkZjQ2JDYkJhQmJDYkahi6FNYP9AKlAbQFhgaUAfYFNMYDJMYBFEYUhgEURhRmJLYBJGYkhgEkVhQmFEYkdjSWAUSmATQWUhBilgJUxgE0VhQmFDYUNhQ2FEYkhgEkhgEklgEk5gEUZhSGC4oRlgKiHvAGQZAGIaADEYABEbACEZABEYABIdABIYABIcABIaABIaABESARgAERIBGQASGgASGgASGgASGgASGQASGgASGQASGgASGQAREQEZABIaABIbABERARoAERMBGgASGQAiFQ",
    reason: 'fog', steps: 8841, total: 345, peak: 1322, lights: [0, 0, 0, 1, 4, 0],
    stats: { strikes: 1, stalls: 0, cloud: 12, reps: 4, deep: 4, trails: 5, wind: 2, thunder: 1, bait: 0, close: 0, scattered: 2, recovered: 1, thrown: 4, dodged: 4, hits: 0, glanced: 0, beast: 3, gates: 0, runes: 0 },
  },
  {
    name: "TST at the keys, sky 5", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQMFAAAAAAAAAAA35Ae4QdAGxQWEBsYB1AK2AeQBtgGkAaYBhAG2AWSGAVSmAURmJEYkZjSWATSGATS2ATTGATTWATSmAjTmAiSGAiTmAyTmAySmAcIB1ghk1gJElgI01gE0pgI0pgMkxh2kAuYCEpABIoYDpAGGAnTWAVSmAUSmATSWASSGASTWARS2ARSmHJEJ8AZC4AMisAIi0AIioAIioAIi8AESQBKgARJQEqABIoACMsACInAi4AEykAIygAK2B4QFpQG0A4UB5AFlhAFVdGWEAYUBdHVUdVSVAUSVATR1FCUUZSSVAiSVFMEB9QTkAdUChAG1AURVJEU0dTRVJEUkVSRVNKUBROUBNMUBJOUBJPU29AblDoApgRvAQZIM8AbBD_IQgAdRwAYhkAIhoAMhwAIRUBHgARFwEcABEYABEaABEYABEZABEZABEXARoAEhsAIhwAEh8AEh0AEh8AEhwAERVKYChAh15ANFhAI1tAE1tAE1dCVEJWQ1dDVkNVQlNCVENWRFdFV0RVRFVEVURVRFNCU0RVRlZGVUVTQ1JDU0VTRFJCUUJRQlFBUURTSFATR1JGUkpQEk9QEUhQHBAaUN6RDlD4QCtgPkCNUBlALFAYQBxQFEhQIkpRHBAdUKlALxEOAHMpAGErABEpADEpACEtACEpACErACEoACErACEvABEpACEvABEoACEuABEoACEsABEoACEsABEtABElASYBJgEnASgAEScBJwEnASgAEScBJwEnASgAEisAIi0AEiwAISIBKQAiKQAyLAAhJAEuABEnASsAEi0AIi8AEioAIi8AESQMYB9Q_mBbIY5gXEA5UCdKIO4AohsAUhwAURoAER4AIR0AERkAIRwAER0AERwAERoAERsAERgAERoAERcBGAARFwEWARcBFgEWARMDSmBOQFtQKUAoUClAHFAVSVAUSFAURF-Qg",
    reason: 'fog', steps: 8376, total: 137.5, peak: 996, lights: [0, 0, 1, 0],
    stats: { strikes: 1, stalls: 0, cloud: 0, reps: 2, deep: 1, trails: 4, wind: 1, thunder: 0, bait: 0, close: 0, scattered: 1, recovered: 0, thrown: 4, dodged: 3, hits: 0, glanced: 0, beast: 0, gates: 0, runes: 0 },
  },
  {
    name: "TST at the keys, sky 10", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQMKAAAAAAAAAABC_QfWQdAGxQWEBsYB1AK2AeQBtgGkAaYBhAG2AWSGAVSmAUR2NGYkRhQmFDYUJhRGFCYURhQmFFYkhgEkhgEkdhQ2FHYkxgEUFhS2ARRGFLYBFIYBFOYBFJYCFKYEFKYBwgHGDIQBlgNk1gJUpgJElgIkZhR2FIYBFNYBFJYbwgGWAaQBhgJ0tgFUdjRWNFY0ZkSGATRGNIYBRIYBNGYkViRmFBYUZiS2ASSGAhSmFsEJsAdC8AMyoAMisAEi8AEisAEikAFEhQTEBqYChALmAZQBtgFklgFEZjRmNGY0ZjRmNHZElgFUpgFEZjRmNEYUFhQmFCYUFhQ2FBYUJhQmJFY0VjRmRHZEdjRGJDYUFhQ2JEYkRiRGJEYkViRGJGY0lgEkRiSmATSGAhIgkgHWMrQCtQKUB5YCpALGAaQBpgFklgFUtgFE1gEklhWiGKBhNLUCxA42lAQW9AEW5AEWdBaEASbkATbEATakATaEATaEATZ0JjQmZDZkNmQmJBYkFiQmVCYkFiQWFBY4WiiqEMIZgCH1A_QHlgKEAsYBlAGmAYQBtgF0lgFUdkRmNEY0ViQWFDYUFhQWFDYkNiRGNFY0RiQmFCYkRiQmFBYUNjRmRFYkJiRGJCYUJiRGNFY0VkSGAVSWAVSWAUR2NHYkNiSGATS2ATTmASQWwgGmHLQD5gL0AYYCpAG2AYQBtgF0pgFkhgFEdkR2hAG2JaQIlgO0AtYBJOIWsAGoBXm4BkmYAzAxgAMhoAIRUBHQASHQAiHwASGgAiHQASGAAiHAASHgASGwASHQASHAASFA5QaUBoYBhANm1AFmxAF2tAF2lAF2dHZ0hgFUVjRWNFY0dkS2ATSGASSWARQmFNYBFNYthAKVA7QI1gHEAqYBtAF2ZFZUZlRmRGZEdjRWJEYUJhQ2FEYklgEUFhSmASSWBsIBxhOUA7YC5AGmAZQBdoQBZkSBC7AHMrADItADIqADIpADIvACEkASUOEP",
    reason: 'fog', steps: 8406, total: 165, peak: 1021, lights: [0, 0, 1, 1, 0],
    stats: { strikes: 4, stalls: 0, cloud: 0, reps: 2, deep: 2, trails: 5, wind: 1, thunder: 0, bait: 0, close: 0, scattered: 3, recovered: 1, thrown: 3, dodged: 2, hits: 0, glanced: 0, beast: 0, gates: 0, runes: 0 },
  },
  {
    name: "TST at the keys, sky 21", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQMVAAAAAAAAAABy9giPQ_ECogNAFKUFhAfWAcQCpgGkAYYBhAGGAWR2VHZEZkSGAUR2NHY0djSWATSGASRWFCYUVhQmFGYklgEkhgEkpgEklgEktgEkpgEkxgEkxgEk1gEk5gEk9gEUVhRmwgHmGmTmAkTGATSmATSmATSWATSWATSWASRGJJYBNKYBNMYBJGYURhR2FGYUtgEU9gbCAcYV5ALWAsQBxgGEAYYBZGZERkRmZIYBdJYBZIYBVHZEhgFElgEkRiQWYPECgBNBgAMx8AIhENUGhAaWAaQDhgGEAmaEAUZUNkQ2VEZENjQmJCYkJiQ2RFZERiQWFDYkJhQWFDYkNiRWNGYkRiRmJHYklgEkxgEUhgEUlg_CAdYKhALmApQBhgJ05gFk9gFU5gFElgI05gIU1hnCAfYCtALWAaQClgGEAlaEATZ0NnRGlAFWhAFWZFZkVkRGREYkFhQmFBYUFhQmFBYUJhQWFCYUJiRWJDYUJtIPOpgMKcgDMCGwBRGgAhGQAxGwAhHAAhGAAhGgAhHQARGAAiHQAyGwAhFAEcABEWARoAEhgAKVCIQDlgPkAtYCpAHGJtQChQLkB4YC5ALGAfQBpgHEAaYBpAGGAWRmREY0VjRGJEYkRiR2JHYUVrEOsBMisBlkhQKkBUWkAxXECqYRkiF0lQbUBIYC5ALWAaQBxgF01gFEpgEkdiSGAiSWCRTWAiS2IoQL1hTAAdECwBPCD_ERwAVisAQywAIisAEi8AEikAESQBJwIsABInASMBJgIrABInAiRNUDtAeGApQCxgG0AaYBhAGGAWR2ZHZUVjQmFCY0VlR2ZGZERjQ2JCYkNjQ2JDZEVkRWVGZUZlRWRFY0NjRWRFZEZkRmNEYkJhQ2JEYkRiRWJGY0tgE0hgIgogG2CPoQxgGiGsABtQbUCYYB1AJmxAFWpAFWhAFWhAFWZEZUVmRmZGZEVkRmNFY0hgFEhgI09hDCAcYCoR_wHA",
    reason: 'fog', steps: 8591, total: 285, peak: 1142, lights: [0, 0, 0, 1, 0],
    stats: { strikes: 3, stalls: 0, cloud: 0, reps: 3, deep: 3, trails: 5, wind: 1, thunder: 0, bait: 0, close: 0, scattered: 6, recovered: 3, thrown: 3, dodged: 3, hits: 0, glanced: 0, beast: 0, gates: 0, runes: 0 },
  },
  {
    name: "TST at the keys, sky 33", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQMhAAAAAAAAAABc8gnQRNAGxQWEBsYB1AK2AeQBtgGkAaYBhAG2AWSGAURmNHZEpgFElgE0hgE0pgE0lgEkZiSWASSGARQmFHYk1gEktgEklgIk1gIUxgEUhgXCAfYPpAGWA3SGAlTWAVTmAUSmATSmATTWASR2FGYUpgEUhhXCAbYJpAPmAvQB9gGkAaYBdIYBVGY0NiRGNGY0ViRGJGYkdiSmARSmARTGDMIB4AVBgBURoAQR4AMR0AIR4AGVCMQCpgX0AfYDZLYDRMYCNNYBNNYBNJYBNLYBRLYBRJYBRJYBNEYkVjR2RIYBRHZEhgE0RiRGJEYkRiRWNIYBNHY0lgEkVhQQsgHGH9QChgPUAYYCpAHWAXSWAVR2RHY0RiRGJFY0hgE0hgEkViS2ASSWASIQkgGGEuoR1gSSAsEI0Agi0AMS4AIS8AIS4AIS4AISwAIS0AIS0AISsAISwAISsAISoAISwAISgAISwAIS8AESsAISgAISgAISkAIS8AESgAIS8AES8AES4AES8AES0AEi8AISUBKQAhKgARLwARLQARLgARKAAhLwARKAAhLwARLQARLwARKwARLwARKgARLgARLAARLAARL2BSTIBrkIhQm0BIUT0QbQGvUF5ASWAoQC5gGUAaYCVLYCNMYHFNYDFFYUtgEk1gE05gFE1gFU5gFk1gFktgFUhgFEdkR2NEYkRiQ2JFY0wgH2AUTmATT2ASSGM7QCpQKUCIYC1ALWAdQBxgGEAbYBZOYBROYCFNYQ4QLJEOEToG0x4AMhsAIRcBHQARGgARGwAWSmArQSxQK0A7UB5AGFAZQBZXRVRDU0NTRFREU0RUR1VHU0RSRFFBUUNRQlFDUkhQEkVRRFFFUUhQEkpQfZF5EaJOYG9AW1AZQDlQHEAXWEAVVENTRFVHVkhQFUlQFUtQFUhQJEtQIk1RTBAbUEpASVAaQBwRE",
    reason: 'fog', steps: 8784, total: 230, peak: 1266, lights: [0, 0, 0, 5, 0, 0],
    stats: { strikes: 2, stalls: 0, cloud: 3, reps: 3, deep: 3, trails: 5, wind: 2, thunder: 0, bait: 1, close: 0, scattered: 2, recovered: 2, thrown: 4, dodged: 4, hits: 0, glanced: 0, beast: 3, gates: 0, runes: 0 },
  },
  {
    name: "TST at the keys, sky 35", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQMjAAAAAAAAAABi2gv9RtEBkAKiAdABFKUE5An2AYQCpgGUAYYBZGZEZlSGAURmNFY0djR2NHY0lgE0hgEkViSWATTGASRWFEYUVhRGFGYUVhRWFHYUVhSGARRmFKYBFIYBFMYBFNYBFIYDFGbCAbYRhAHWA1SGAkT2ATSmASRmFDYUZiS2ASSmASTWASSmAiT2EsIB5gukAqYDpAGWAnTGAVTGAVTmATR2JKYBJOYBFMYOoQ6wB6YGhASlAsQCxQGkAaUBdIUBZKUBdMUBZJUBRGU0ZTRlNFU0dTRVJDUkVSQ1FBUURTR1NGU0ZTR1NFUkVSRFJFUkVSRVJGU0pQEkNRRFFDUUVRQlFIUBJMUBJJUCERChAcUYtAH1AnT1AVTFAUSFASRFJGVERVRFRCUkJTQlNDVUVXRlZGVUlQFUpQnBAdUWxAWxCJkR0QnwCDLwAyKwAhJQEsABEnASoAEi5geUA4UD5AK1AqQBxQJk5QI0lQIkxQIk5QIkhQIktQEktQE05QE0lQE0lQE0lQFEtQFUxQFUtQFUtQFEhQE0ZRQVFFEQYeUDRPUh5ATiCbAFYaAEIaABEXARkAERcBFwEYABEWARgAERUBGAARFAEZABIdABIZABIcABIcIEpgsloSLwBlLABLYGtAZ1lANVxAFFlAE1VCVUNWQ1VCU0JTQlRDVU5SOUBIUExAHlApQBpQKEAfUBdMUBZJUBVIUBRGVEZTRFNFU0VUR1RFU0VTRFJDUUFRQlJFU0VTR1RHURIJEBddkY8QbyHNBPIrABsQrlGcQChgKUCfUBtAKVAbQBdZQBZXRVZFVkRUQ1NCUkFRQlNDVERVRhQCGVAWR1VGVUdVR1VJUBVJUBRKUBRNUBNMUBRPUhpAPGAZQCwAH0DbUC1ALVAdQBtQGEAXVEVUR1NEUkVSRlJGUURRSFARSVBbIJqgyoBIAYtgW0CJUB9AKFAeQBdbQBdZQBZWRVVEVEVVRVNDU0VURlRGUouRDlFLQB",
    reason: 'fog', steps: 9085, total: 245, peak: 1498, lights: [0, 0, 0, 0, 1, 0],
    stats: { strikes: 1, stalls: 0, cloud: 0, reps: 5, deep: 5, trails: 5, wind: 0, thunder: 0, bait: 0, close: 3, scattered: 0, recovered: 0, thrown: 6, dodged: 3, hits: 0, glanced: 0, beast: 3, gates: 1, runes: 4 },
  },
  {
    name: "collector at the keys, sky 4", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQMEAAAAAAAAAAD3AdYK0EXQBsUFhAbGAdQCtgHkAbYBpAGmAYQBtgFkhgFUpgFEdjRmJFYkViRmJGYkdiR2JIYBJIYBFCYUdhQ2FIYBJPYBJNYBFFYU5gEUtgEUpgIUhgMUpgHCAdYMdLYDROYBJHYk1gE0tgI0hgMklh1yUDS2A2TGAUSWASQ2JIYBNIYBNJYBNKYBNLYBNPYBNJYDFMYWmhOJF8oNuAeaAekFyATFBrQCpgXUAYYC5AG2AfQBlgGEAmbEAVaEAlbEAkaUAjakASZkJnQ25Aj2GaQDhgWEAcYCVIYCRLYBNHYkRhQmFDYUJhQ2FCYUJhQ2JFYkNhQWFDYUFhQ2JEY0ZkR2VHYUyjvpBogFOskSyge2CcQBlRHEAeUDdKUCZOUBVKUBVKUBVJUBVIUBVHU0JRQlFBUUJSRFNDXIB4oCuAGKBogEuQmqDPgCyQTIB9kCWNoC-BvVB8QB1ga0CpYEhAGWBhSWDeoQlgSSDcYE9AHFA9QH5gGkArYBtAG2AYQBtgFUlgE0diR2JMYBJKYWpAEgogHmA9QBlgKkAdYBhAG2AUSJMfgFtgSqEMYbpAH1CPEGgAlSgANSsAGiATCyAeUapAPGAYQE1ghEhQ3BAeUJ2QXaHJgGyQm1DGSGHNQDlgOEA7YBpAJ29AE2EoABMhaUATbEATbkASZUFlQWRBZEFjQWVCZ0JlQmRCZUJjQmVDZEJjQmNDZURkQ2NDY0NjRGNEZEdkR2NGY0pgE01gE0phg",
    reason: 'fog', steps: 8912, total: 617.5, peak: 1366, lights: [0, 1, 0, 0, 0, 4],
    stats: { strikes: 1, stalls: 0, cloud: 2, reps: 2, deep: 1, trails: 5, wind: 1, thunder: 0, bait: 1, close: 0, scattered: 0, recovered: 0, thrown: 3, dodged: 3, hits: 0, glanced: 0, beast: 3, gates: 1, runes: 8 },
  },
  {
    name: "collector at the keys, sky 12", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQMMAAAAAAAAAACAAscKwkXQBsUFhAbGAdQCtgHkAbYBpAGmAYQBtgFkhgFUpgFEdjR2NJYBRNYBROYBNKYBJHYUNhR2FDYUhgEk5gE01gI0pgIkpgEURhSWARRmFGYUhgEUVhIQogHGCTTGG5QB9gJk9gFU1gFElgEkRiR2JGYkZiSWATTmATSGAjIgcoYchALWAqQBxgF0hgFkdlRmVGZUZlRGigqoBIkN2gX4DmnYFeYHpAK1BMQDtQKEAuUBpAGlAXSFAWSFAVR1VIUBRGU0VSQ1FCUkZSRFJGUkZSR1JJUBJNUBJJUB0g6WGcQBtgZEpRfxCJUC1AK2AsQJJuQLlQLWBZIFqiuIC6oB6RiIBWKGC7QBtS7kAuYB9AbFAqQC9QG0AfUBhAGVAlSFAjT1AxSVC8EB5QzkAvUCpAO1AeQChQH0AWWkAXWEAXVUdTRlJFUURRRlFIUBFIUSwQHVDfQD5QL0AYUCtAHFAXSVAVSFAVSlAUR1JEUkhQE05QE0pRPBAYUB2RDlDGSqJLgB-Q2IAdoCyATSAXCWBcQE5QGkA7UBhAKFAZQBVVQ1RDVENTQlNDVENURFVEVUVWRVZGV0ZWRlZFVENSQlJCUkNTQ1JCUkNTRFNEU0RTRVNFU0VTR1JCUUFdkQlQmBFYAD1QS0BOYJZOUS9AK1AboU2QWIAskB-APaBJkF2Aq2BNoBmATJDtUQxAfFBbQBhQN0xQJU1QFEpQE0dTSVATRlNJUBRJUBRJUBRIUBRJUBRIUBRJUBVGWBASAhtQJUhQI0hQEktQEk5QEk1RA",
    reason: 'fog', steps: 8898, total: 640, peak: 1351, lights: [0, 0, 5, 0, 0, 0],
    stats: { strikes: 1, stalls: 0, cloud: 12, reps: 5, deep: 4, trails: 4, wind: 1, thunder: 0, bait: 0, close: 0, scattered: 2, recovered: 2, thrown: 4, dodged: 4, hits: 0, glanced: 0, beast: 3, gates: 2, runes: 3 },
  },
  {
    name: "holding its line at the keys, sky 7", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQMHAAAAAAAAAABE_wfmQdAGxQWEBsYB1AK2AeQBtgGkAaYBhAG2AWSGAVSmAUR2NHY0lgFE1gE0dhQWFHYklgEkhgEUNhRmFFYUZhRWFHYUZhRmFHYUZhSGARRWFJYBJIYCJLYBJPYBFBCyAbYIRJYetAHWAnTmAVSmAUSGATR2NHY0lgFE1gFE1gEkFsIBhh_UAsYC1AHGAaQBlgGUAYYBdFZENjQ24geQB0GABCGwAiHgAiGgAiGwAiGAAiGAAiHwASHgAREwEaABEWARgAFU1gLEDqUCxALFAcQBhQF0ZWRldIUBdGVERTRFRFVEZURFJDUkNSQ1JEUkNSRVNGUkRSRlNLUBRMUCNJUHwQGVFNQCtSD0A6Ud1AO2AZQGgAFCJoQBohiQBsEG5Sm0AoYE5AOGAtQBxgGUAbYBdLYBZMYBVOYBNKYBJEbCAZYaxALmAuQBxgGkAZYBlAFmVDY0JjQ2RDZENjQWFCZENjQmNCY0FiTxDoAHQtAIIoAFIpAFIuAEErABEuACEoACEqACEpACEsAGkRewBlLABCLQARJwErABEoABEpABEpABEnASYBJQEqABIqACIsABEkASoAESUBKQARJgEoABEmAStga0B3XkAlXEAVXEAVWUAVWUAWWUAWV0VWRlZHV0lQFUZTRVJKUntAOWAdQHxQLkAuUB9AGlAaQBhQGEAWVkZWRVRDUkJSQlFBUkNTRFNDU0VURlREUhMHGVAkSlASR1FMUdgRDwMqId4AShAcABtQbkB5YBhANG1AE25AE2xAEmdBYkFmQWNBZEFjQWRCaEATZkJjQWJCZEJjQ2VFZkZlRmRGZEhgFEpgE0tgEk1gEkhgvCAeYP9AKGA7QB1gFklgFUlgFEhgFElgFEpgE0djS2ASRGFFYk1gEk1gEkhhDCAYYN1ALmAtQB9gGUAaYBdJYBZIYBRFY0Rg",
    reason: 'fog', steps: 8422, total: 170, peak: 1023, lights: [0, 0, 5, 1, 0],
    stats: { strikes: 6, stalls: 0, cloud: 2, reps: 4, deep: 4, trails: 4, wind: 0, thunder: 1, bait: 0, close: 0, scattered: 4, recovered: 1, thrown: 4, dodged: 1, hits: 3, glanced: 0, beast: 0, gates: 0, runes: 0 },
  },
  {
    name: "holding its line and taking Algiz at the keys, sky 1", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQMBAAAAAAAAAABgwwrIRNAGxQWEBsYB1AK2AeQBtgGkAaYBhAG2AWSGAVSmAURmJEYkZjSGASQ2FEYkhgE0tgEkRhRWFDYUZiTWATTWAjTWAySmBxSGAcIBpgyUAeYCVKYBNIYBNJYBNJYBNJYBNMYBNLYBFBYUpgEkphzCAfYC5ALGAtQBxgGUAZYBdIYBdJYBdJYBZIYBRGZEpgFEpgEkhgEkxhOSDpBEMuADItACElASgAEioAEi4AEi4AEi8AEi4AESQBKwARJwEqABEpABEsABErABEuABEtABEvABEtABEsABEtABEsABEsABEsABEkD2BdQHVbQCReQBRcQBRaQBRZQBRYQBRYQBRWQ1RCU0JURFdFVkRUQ1NCUkJSQlNEVERTQ1JCUUFRQVFDU0VTRFJEUkVTSVATSlASTFASSlAuIO1hekAyXGBmSlF8EBRbQStQGEA3X0AVW0AVXUAWXkAWU04BKBHdAiEoAFEuADEsABNPUEpAXWAoQC5gKEAcYDRMYDNOYCNJYCNMYBNKYBNJYBRLYBRIYBNFY0dkR2NEY0dlSWAVR2RHZEZjRWJDYkRiRWNHY0ZiIgggG2IaQD5gL0AeYBtAFWlAFGtAFGpAE2dDaEATZUJkQmNCY0JjQ2NDY0FmIQUuYhhAXmApQC5gGkAZYBdHZUZlR2ZIYBREY0VjRWNBZSIFKWAlT2AUSmAjT2HfQB5gKUAfYBdMYBZKYBRGY0dkSWAUSWATR2JEYUFjIQggH2FJEc0Bz2ArQNpQK0AtUB1AGlAZQBdWRlZGVkdXR1ZGVUZWR1ZHVkhQFkdVR1VIUBVJUBRHU0dSRFFDUURRRVJPUBFHUUhQHBAeUYxAKFA7QB1QF0hQFUdVR1VHVUdVR1RFVEhQFUhQFElQFEpQE01QEklQHiCpAjsR-ACTLABSLwAxKQARLAAhLAARKQAhKgAYEP",
    reason: 'fog', steps: 8776, total: 240, peak: 1347, lights: [0, 0, 4, 0, 0, 5],
    stats: { strikes: 1, stalls: 0, cloud: 15, reps: 5, deep: 5, trails: 4, wind: 1, thunder: 0, bait: 0, close: 1, scattered: 1, recovered: 0, thrown: 4, dodged: 1, hits: 1, glanced: 1, beast: 3, gates: 1, runes: 2 },
  },
]);

test('runs flown in a browser replay in Node to the very sheet the browser showed', () => {
  assert.equal(GOLDEN.length, 13);
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
