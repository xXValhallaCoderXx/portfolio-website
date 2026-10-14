import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeLog } from './recorder.js';
import { replayLog } from './replay.js';
import { SIM_VERSION } from './sim-version.js';

// Runs of Good Lift as their challenge links, each with the sheet a browser came to for it: three
// flown in Chromium on keys alone, and eight flown in Node by the reference pilots at the keys
// (with kettlebells, a close call, doubled lifts, reps to depth and climbs past 1,300 m) that
// Chromium replayed to the same sheets (.artifacts/flight-qa/golden-qa.mjs does both, and
// node-goldens.mjs beside it records the Node ones). All are SIM_VERSION 2's. Replayed here they
// must come to the very same sheet: if one does not, either how a run flies has changed without a
// new SIM_VERSION, or Node's maths and the browser's part ways, and every link shared would replay
// differently from how it was flown. Record them afresh with each new SIM_VERSION.
const GOLDEN = Object.freeze([
  {
    name: "column, eased", engine: "chromium 143.0.7499.4",
    link: "AQJKOywdAAAAAAAUnQLXIvAb0kO2CdJDlgry4QHQHuFz",
    reason: 'fog', steps: 4439, total: 50, peak: 285, lights: [0, 0],
    stats: { strikes: 0, stalls: 0, cloud: 0, reps: 0, deep: 0, trails: 1, close: 0, thrown: 0, dodged: 0, hits: 0 },
  },
  {
    name: "column, the other way", engine: "chromium 143.0.7499.4",
    link: "AQLu_8AAAAAAAAAWrQLNI_Ab8awCgrwBmC3iBw",
    reason: 'fog', steps: 4557, total: 55, peak: 301, lights: [0, 0],
    stats: { strikes: 0, stalls: 0, cloud: 0, reps: 0, deep: 0, trails: 1, close: 0, thrown: 0, dodged: 0, hits: 0 },
  },
  {
    name: "on the bar", engine: "chromium 143.0.7499.4",
    link: "AQIDAO1eAAAAAAAKadoB8AG4GQ",
    reason: 'landed', steps: 217, total: 25, peak: 105, lights: [0],
    stats: { strikes: 0, stalls: 0, cloud: 0, reps: 0, deep: 0, trails: 0, close: 0, thrown: 0, dodged: 0, hits: 0 },
  },
  {
    name: "TST at the keys, sky 3", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQIDAAAAAAAAAABEnAmyQ9AGxQWEBsYB1AK2AeQBtgGkAaYBhAG2AWSGAURmJDYkViRGJFYkViRmNKYBNJYBJFYklgEkdiSWASSGARQmFIYBJMYBJKYBJPYBJPYBFEYUlgIU5gEU1gHCAYYUlAH2AmSGAlTWAUSWATSGATSWAUTWAUTWAUSWAjSGAiTWDsIB5g-kA9YC1AHGAYQBhgF0lgGEAaYBZGY0RjRWNGY0ViRWJGYkhgEkhgeCE-Ab1gfkA5UClAPVAbQBtQF0tQFUxQE0lQEkxQEkxRNktQJU5QFElQE0hQFEJcEBtQJU5QFExQE0xQE0hQIktQIUxRyEA5UD9AR1xAHyGdAHMfADIZADIcACETAR0AERUBGQASGAAjGAAiFgEYUJtALGBfQB9gRE9g_KEJYQtAN19AW2BoQBxgckhgUk9gEktgEklgEkZiR2JEYUJhQ2JGY0dhQwkgHmAXSWAVRmVHZUVkRW0AYxoA0R0AMRgAIRsAMR8AIRoAMRkAQR0AUR0AUR8AQR4AQRkAPCD6EXwAdCoAQisAIi4AIisAIisAIioAIyMIYG1Ag19AYlhAEVVBVkJbQBJVQVJBVUJWQlVCVUJUQlRBUUFTQlRCU0JUQlJBUkJUQ1RDVENURFtAHVI9QG1QOUArUCpAG1AXSVAWSFAVRlVIUBZHVEVURVNEU0RTRVRGVEZUR1RGVElQFUdVEwQfUENJUd5ASVAvQBsRrgBWLQBDKgAiKwASLgASKgASLAATKQAjKAAjLwASJwEkASUBJAElASMBJgEjASUBJAEkASRPUDlAaWAqQC5gG0AcYBlAG2AWRmNDYkNiQmFCYkNiRqGNoOlg-0CdYn1AK1AoQL5gHkApYBtAFmdEZUNjQmJBYUFiQmJBYUFiQ2VFZkZnR2ZFZEVlR2VJIBECKWASRmNLYBJHYUpgEU5gSRB7AfYeABYZABUXBBcDFAITAREBFktgHUBg",
    reason: 'fog', steps: 8626, total: 170, peak: 1180, lights: [0, 0, 0, 1, 5],
    stats: { strikes: 2, stalls: 0, cloud: 14, reps: 3, deep: 3, trails: 5, close: 0, thrown: 3, dodged: 3, hits: 0 },
  },
  {
    name: "TST at the keys, sky 5", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQIFAAAAAAAAAAAz5Ae4QdAGxQWEBsYB1AK2AeQBtgGkAaYBhAG2AWSGAVSmAURmJEYkZjSWATSGATS2ATTGATTWATSmAjTmAiSGAiTmAyTmAySmAcIB1ghk1gJElgI01gE0pgI0pgMkxh2kAuYCEpABIoYDpAGGAnTWAVSmAUSmATSWASSGASTWARS2ARSmHJEJ8AZC4AMisAIi0AIioAIioAIi8AESQBKgARJQEqABIoACMsACInAi4AEykAIygAK2B4QFpQG0A4UB5AFlhAFVdGWEAYUBdHVUdVSVAUSVATR1FCUUZSSVAiSVFMEB9QTkAdUChAG1AURVJEU0dTRVJEUkVSRVNKUBROUBNMUBJOUBJPU29AblDoApgRvAQZIM8AbBD_IQgAdRwAYhkAIhoAMhwAIRUBHgARFwEcABEYABEaABEYABEZABEZABEXARoAEhsAIhwAEh8AEh0AEh8AEhwAERVKYChAh15ANFhAI1tAE1tAE1dCVEJWQ1dDVkNVQlNCVENWRFdFV0RVRFVEVURVRFNCU0RVRlZGVUVTQ1JDU0VTRFJCUUJRQlFBUURTSFATR1JGUkpQEk9QEUhQHBAaUN6RDlD4QCtgPkCNUBlALFAYQBxQFEhQIkpRHBAdUKlALxEOAHMpAGErABEpADEpACEtACEpACErACEoACErACEvABEpACEvABEoACEuABEoACEsABEoACEsABEtABElASYBJgEnASgAEScBJwEnASgAEScBJwEnASgAEisAIi0AEiwAISIBKQAiKQAyLAAhJAEuABEnASsAEi0AIi8AEioAIi8AESQMYB9Q_mBbIY5gXEA5UCdKIO4AohsAUhwAURoAER4AIR0AERkAIRwAER0AERwAERoAERsAERgAERoAERcBGAARFwEWARcBFgEWARMDSmBOQFtQKUAoUClAHFAVSVAUSFAURF-Qg",
    reason: 'fog', steps: 8376, total: 127.5, peak: 996, lights: [0, 0, 1, 0],
    stats: { strikes: 1, stalls: 0, cloud: 0, reps: 2, deep: 1, trails: 4, close: 0, thrown: 4, dodged: 3, hits: 0 },
  },
  {
    name: "TST at the keys, sky 10", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQIKAAAAAAAAAABI_QfWQdAGxQWEBsYB1AK2AeQBtgGkAaYBhAG2AWSGAVSmAUR2NGYkRhQmFDYUJhRGFCYURhQmFFYkhgEkhgEkdhQ2FHYkxgEUFhS2ARRGFLYBFIYBFOYBFJYCFKYEFKYBwgHGDIQBlgNk1gJUpgJElgIkZhR2FIYBFNYBFJYbwgGWAaQBhgJ0tgFUdjRWNFY0ZkSGATRGNIYBRIYBNGYkViRmFBYUZiS2ASSGAhSmFsEJsAdC8AMyoAMisAEi8AEisAEikAFEhQTEBqYChALmAZQBtgFklgFEZjRmNGY0ZjRmNHZElgFUpgFEZjRmNEYUFhQmFCYUFhQ2FBYUJhQmJFY0VjRmRHZEdjRGJDYUFhQ2JEYkRiRGJEYkViRGJGY0lgEkRiSmATSGAhIgkgHWMrQCtQKUB5YCpALGAaQBpgFklgFUtgFE1gEklhWiGKBhNLUCxA42lAQW9AEW5AEWdBaEASbkATbEATakATaEATaEATZ0JjQmZDZkNmQmJBYkFiQmVCYkFiQWFBY4WiiqEMIZgCH1A_QHlgKEAsYBlAGmAYQBtgF0lgFUdkRmNEY0ViQWFDYUFhQWFDYkNiRGNFY0RiQmFCYkRiQmFBYUNjRmRFYkJiRGJCYUJiRGNFY0VkSGAVSWAVSWAUR2NHYkNiSGATS2ATTmASQWwgGmHLQD5gL0AYYCpAG2AYQBtgF0pgFkhgFEdkR2hAG2JaQIlgO0AtYBJOIWsAGoBXm4BkmYAzAxgAMhoAIRUBHQASHQAiHwASGgAiHQASGAAiHAASHgASGwASHQASHAASFA5QaUBoYBhANm1AFmxAF2tAF2lAF2dHZ0hgFUVjRWNFY0dkS2ATSGASSWARQmFNYBFNYthAKVA7QI1gHEAqYBtAF2ZFZUZlRmRGZEdjRWJEYUJhQ2FEYklgEUFhSmASSWBsIBxhOUA7YC5AGmAZQBdoQBZkSBC7AHMrADItADIqADIpADIvACEkASUMEPIg",
    reason: 'fog', steps: 8406, total: 180, peak: 1021, lights: [0, 0, 1, 1, 0],
    stats: { strikes: 4, stalls: 0, cloud: 0, reps: 2, deep: 2, trails: 5, close: 0, thrown: 3, dodged: 3, hits: 0 },
  },
  {
    name: "TST at the keys, sky 21", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQIVAAAAAAAAAACiAfYIj0PxAqIDQBSlBYQH1gHEAqYBpAGGAYQBhgFkdlR2RGZEhgFEdjR2NHY0lgE0hgEkVhQmFFYUJhRmJJYBJIYBJKYBJJYBJLYBJKYBJMYBJMYBJNYBJOYBJPYBFFYUZsIB5hpk5gJExgE0pgE0pgE0lgE0lgE0lgEkRiSWATSmATTGASRmFEYUdhRmFLYBFPYGwgHGFeQC1gLEAcYBhAGGAWRmREZEZmSGAXSWAWSGAVR2RIYBRJYBJEYkFmDxAoATQYADMfACIRDVBoQGlgGkA4YBhAJmhAFGVDZENlRGRDY0JiQmJCYkNkRWREYkFhQ2JCYUFhQ2JDYkVjRmJEYkZiR2JJYBJMYBFIYBFJYPwgHWCoQC5gKUAYYCdOYBZPYBVOYBRJYCNOYCFNYZwgH2ArQC1gGkApYBhAJWhAE2dDZ0RpQBVoQBVmRWZFZERkRGJBYUJhQWFBYUJhQWFCYUFhQmFCYkViQ2FCbSDzqYDCnIAzAhsAURoAIRkAMRsAIRwAIRgAIRoAIR0AERgAIh0AMhsAIRQBHAARFgEaABIYAClQiEA5YD5ALWAqQBxibUAoUC5AeGAuQCxgH0AaYBxAGmAaQBhgFkZkRGNFY0RiRGJEYkdiR2FFaxDrATIrAZZIUCpAVFpAMVxAqmEZIhdJUG1ASGAuQC1gGkAcYBdNYBRKYBJHYkhgIklgkU1gIktiKEC9YUwAHRAsATwg_xEcAFYrAEMsACIrABIvABIpABEkAScCLAASJwEjASYCKwASJwIkTVA7QHhgKUAsYBtAGmAYQBhgFkdmR2VFY0JhQmNFZUdmRmREY0NiQmJDY0NiQ2RFZEVlRmVGZUVkRWNDY0VkRWRGZEZjRGJCYUNiRGJEYkViRmNLYBNIYCIKIBtgj6EMYBohrAAbUG1AmGAdQCZsQBVqQBVoQBVoQBVmRGVFZkZmRmRFZEZjRWNIYBRIYCNPYQwgHGAqEf8Bw",
    reason: 'fog', steps: 8591, total: 405, peak: 1142, lights: [0, 0, 0, 1, 0],
    stats: { strikes: 3, stalls: 0, cloud: 0, reps: 3, deep: 3, trails: 5, close: 0, thrown: 3, dodged: 3, hits: 0 },
  },
  {
    name: "TST at the keys, sky 33", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQIhAAAAAAAAAABU6gnDRNAGxQWEBsYB1AK2AeQBtgGkAaYBhAG2AWSGAURmNHZEpgFElgE0hgE0pgE0lgEkZiSWASSGARQmFHYk1gEktgEklgIk1gIUxgEUhgXCAfYPpAGWA3SGAlTWAVTmAUSmATSmATTWASR2FGYUpgEUhhXCAbYJpAPmAvQB9gGkAaYBdIYBVGY0NiRGNGY0ViRGJGYkdiSmARSmARTGDMIB4AVBgBURoAQR4AMR0AIR4AGVCMQCpgX0AfYDZLYDRMYCNNYBNNYBNJYBNLYBRLYBRJYBRJYBNEYkVjR2RIYBRHZEhgE0RiRGJEYkRiRWNIYBNHY0lgEkVhQQsgHGH9QChgPUAYYCpAHWAXSWAVR2RHY0RiRGJFY0hgE0hgEkViS2ASSWASIQkgGGEuoR1gSSAsEI0Agi0AMS4AIS8AIS4AIS4AISwAIS0AIS0AISsAISwAISsAISoAISwAISgAISwAIS8AESsAISgAISgAISkAIS8AESgAIS8AES8AES4AES8AES0AEi8AISUBKQAhKgARLwARLQARLgARKAAhLwARKAAhLwARLQARLwARKwARLwARKgARLgARLAARLAARL2BSTIBrkIhQm0BIUT0QbQGvUF5ASWAoQC5gGUAaYCVLYCNMYHFNYDFFYUtgEk1gE05gFE1gFU5gFk1gFktgFUhgFEdkR2NEYkRiQ2JFY0wgH2AUTmATT2ASSGM7QCpQKUCIYC1ALWAdQBxgGEAbYBZOYBROYCFNYQ4QLJEOEToG0x4AMhsAIRcBHQARGgARGwAWSmArQSxQK0A7UB5AGFAZQBZXRVRDU0NTRFREU0RUR1VHU0RSRFFBUUNRQlFDUkhQEkVRRFFFUUhQEkpQeZEIUFwRC1A4QCtgOkCNUBtAKlAcQBpQGkAbUBhAGlAVSFAUSFATSFASRVJLUBJOUBJMUSwQG1BvET8ASSAaAFQoAB",
    reason: 'fog', steps: 8771, total: 210, peak: 1258, lights: [0, 0, 0, 5, 0, 0],
    stats: { strikes: 2, stalls: 0, cloud: 3, reps: 4, deep: 3, trails: 5, close: 0, thrown: 4, dodged: 4, hits: 0 },
  },
  {
    name: "collector at the keys, sky 4", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQIEAAAAAAAAAADDAdcK1kXQBsUFhAbGAdQCtgHkAbYBpAGmAYQBtgFkhgFUpgFEdjRmJFYkViRmJGYkdiR2JIYBJIYBFCYUdhQ2FIYBJPYBJNYBFFYU5gEUtgEUpgIUhgMUpgHCAdYMdLYDROYBJHYk1gE0tgI0hgMklh1yUDS2A2TGAUSWASQ2JIYBNIYBNJYBNKYBNLYBNPYBNJYDFMYWmhOJF8oNuAeaAekFyATFBrQCpgXUAYYC5AG2AfQBlgGEAmbEAVaEAlbEAkaUAjakASZkJnQ25Aj2GaQDhgWEAcYCVIYCRLYBNHYkRhQmFDYUJhQ2FCYUJhQ2JFYkNhQWFDYUFhQ2JEY0ZkR2VHYUyjvpBogFOskSyge2CcQBlRHEAeUDdKUCZOUBVKUBVKUBVJUBVIUBVHU0JRQlFBUUJSRFNDXIB4oCuAGKBogEuQmqDPgCyQTIB9kCWNoC-BvVB8QB1ga0CpYEhAGWBhSWDeoQlgSSDcYE9AHFA9QH5gGkArYBtAG2AYQBtgFUlgE0diR2JMYBJKYWpAEgogHmA9QBlgKkAdYBhAG2AUSJMfgFtgSqEMYbpAHlCoQElQPkAfUBlAHFAWR1NEUkNSRVRCXBASUUlQEkVSR1NLUBRJUCNNUBJJUCJPUb1AH1AoQB1QFklQFEZUSFAVSVAVSFAUR1NDUhIIEBhQNE9Q7JCooCuQ_qHKIL8Ab1A7QEtgOEArYCtAHWAZQBlgF0ZnRmdFZ0VpQBVpQBNmQ2pAE2lAE25AE2tAEmdCaUASZUJnQmNBY0JmQ2ZDZUJjQmNCZENkQ2VFZ0ZlRWVGZUdhQwkgGGAkT2ATS2AxS2EA",
    reason: 'fog', steps: 8918, total: 487.5, peak: 1367, lights: [0, 1, 0, 0, 0, 4],
    stats: { strikes: 1, stalls: 0, cloud: 3, reps: 2, deep: 1, trails: 5, close: 1, thrown: 3, dodged: 2, hits: 0 },
  },
  {
    name: "collector at the keys, sky 12", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQIMAAAAAAAAAACiAbkJ7kPQBsUFhAbGAdQCtgHkAbYBpAGmAYQBtgFkhgFUpgFEdjR2NJYBRNYBROYBNKYBJHYUNhR2FDYUhgEk5gE01gI0pgIkpgEURhSWARRmFGYUhgEUVhIQogHGCTTGG5QB9gJk9gFU1gFElgEkRiR2JGYkZiSWATTmATSGAjIgcoYchALWAqQBxgF0hgFkdlRmVGZUZlRGigqoBIkN2gX4DmnYFeYHpAK1BMQDtQKEAuUBpAGlAXSFAWSFAVR1VIUBRGU0VSQ1FCUkZSRFJGUkZSR1JJUBJNUBJOUMwQHVD7QC9QKUAdUBdOUBZLUBRJUBNGUkRURVVIUBRLUBJPUUwQG1D-QCpgKkEuUBlAN1kAXZB7pGyAWJFtgD2gToCUnYAknIAVlYmQHGCOQBhQ90pQRU5QJUlQJU1QFElQFEpQFUtQFUlQFEhQFEdUSVAUR1NGU0hQE0ZSRVFBUUZSTBAdUfsQtE9gP0DEa0DdUCtALlAcQBtQGEAaUBdLUBZMUBVOUBRPUCJJUEwQGFD8kQxQzUAYYFlAW1A4QBhR3BAZUB5AKVAtQBpQGUAXV0ZWRVZFVURUQ1NDU0JSQlJCUkJSQlJCUkNURlVGVEdUSVAUTFAiQV6jJYmR_aCrIEoQjlBpQClgPECrUBtAKFAcQBZXRFVEVENURVZGVUZVR1RGVEhQE0ZSRFFDUURRQ1FHUkxQIUlQnBAfUIySmIAsoT-APpB-gD-gO2BfQD",
    reason: 'fog', steps: 8686, total: 405, peak: 1209, lights: [0, 0, 4, 0, 0],
    stats: { strikes: 0, stalls: 0, cloud: 20, reps: 5, deep: 5, trails: 4, close: 0, thrown: 4, dodged: 4, hits: 0 },
  },
  {
    name: "holding its line at the keys, sky 7", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQIHAAAAAAAAAABE_wfmQdAGxQWEBsYB1AK2AeQBtgGkAaYBhAG2AWSGAVSmAUR2NHY0lgFE1gE0dhQWFHYklgEkhgEUNhRmFFYUZhRWFHYUZhRmFHYUZhSGARRWFJYBJIYCJLYBJPYBFBCyAbYIRJYetAHWAnTmAVSmAUSGATR2NHY0lgFE1gFE1gEkFsIBhh_UAsYC1AHGAaQBlgGUAYYBdFZENjQ24geQB0GABCGwAiHgAiGgAiGwAiGAAiGAAiHwASHgAREwEaABEWARgAFU1gLEDqUCxALFAcQBhQF0ZWRldIUBdGVERTRFRFVEZURFJDUkNSQ1JEUkNSRVNGUkRSRlNLUBRMUCNJUHwQGVFNQCtSD0A6Ud1AO2AZQGgAFCJoQBohiQBsEG5Sm0AoYE5AOGAtQBxgGUAbYBdLYBZMYBVOYBNKYBJEbCAZYaxALmAuQBxgGkAZYBlAFmVDY0JjQ2RDZENjQWFCZENjQmNCY0FiTxDoAHQtAIIoAFIpAFIuAEErABEuACEoACEqACEpACEsAGkRewBlLABCLQARJwErABEoABEpABEpABEnASYBJQEqABIqACIsABEkASoAESUBKQARJgEoABEmAStga0B3XkAlXEAVXEAVWUAVWUAWWUAWV0VWRlZHV0lQFUZTRVJKUntAOWAdQHxQLkAuUB9AGlAaQBhQGEAWVkZWRVRDUkJSQlFBUkNTRFNDU0VURlREUhMHGVAkSlASR1FMUdgRDwMqId4AShAcABtQbkB5YBhANG1AE25AE2xAEmdBYkFmQWNBZEFjQWRCaEATZkJjQWJCZEJjQ2VFZkZlRmRGZEhgFEpgE0tgEk1gEkhgvCAeYP9AKGA7QB1gFklgFUlgFEhgFElgFEpgE0djS2ASRGFFYk1gEk1gEkhhDCAYYN1ALmAtQB9gGUAaYBdJYBZIYBRFY0Rg",
    reason: 'fog', steps: 8422, total: 170, peak: 1023, lights: [0, 0, 5, 1, 0],
    stats: { strikes: 6, stalls: 0, cloud: 2, reps: 4, deep: 4, trails: 4, close: 0, thrown: 4, dodged: 1, hits: 3 },
  },
]);

test('runs flown in a browser replay in Node to the very sheet the browser showed', () => {
  assert.equal(GOLDEN.length, 11);
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
