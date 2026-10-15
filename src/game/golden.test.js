import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeLog } from './recorder.js';
import { replayLog } from './replay.js';
import { SIM_VERSION } from './sim-version.js';

// Runs of Good Lift as their challenge links, each with the sheet a browser came to for it: five
// flown in Chromium on keys alone (one of them out of the launch column with the big ears, E,
// opened again by the brake, and one climbing in the column and then flying a set of wingovers,
// which lands its style; none of them catches a surge, so the column's edge collapses them low and
// two touch down), and sixteen flown in Node by the reference pilots at the keys (with kettlebells
// and close calls, the Beast, a blessing taken and a bell turned aside by Algiz, plates off the sky,
// doubled lifts and climbs to 1,500 m, TST pulling its ears out of lift, a pilot that never catches
// its wing, which collapses, TST flying wingovers and pitching its wing, each landing its style,
// TST flying its wingovers on into three loops, which land, and TST pitching its wing too long, the
// collapse pumped open) that Chromium replayed to the same sheets (.artifacts/flight-qa/golden-qa.mjs does
// both, and node-goldens.mjs beside it records the Node ones). All are SIM_VERSION 4's. Replayed
// here they must come to the very same sheet, style and all: if one does not, either how a run
// flies has changed without a new SIM_VERSION, or Node's maths and the browser's part ways, and
// every link shared would replay differently from how it was flown. Record them afresh with each
// new SIM_VERSION.
const GOLDEN = Object.freeze([
  {
    name: "column, eased", engine: "chromium 143.0.7499.4",
    link: "AQRKOywdAAAAAAAKoQH2E4AZwkO2CdJDxgniiwE",
    reason: 'fog', steps: 2550, total: 25, peak: 161, lights: [0],
    stats: { strikes: 0, stalls: 0, cloud: 0, reps: 0, deep: 0, trails: 0, wind: 0, thunder: 0, bait: 0, close: 0, scattered: 0, recovered: 0, thrown: 0, dodged: 0, hits: 0, glanced: 0, beast: 0, gates: 0, runes: 0, style: 0, wingovers: 0, pitch: 0, loops: 0 },
  },
  {
    name: "column, the other way", engine: "chromium 143.0.7499.4",
    link: "AQTu_8AAAAAAAAAKqgGlE8AakZoC",
    reason: 'fog', steps: 2469, total: 25, peak: 170, lights: [0],
    stats: { strikes: 0, stalls: 0, cloud: 0, reps: 0, deep: 0, trails: 0, wind: 0, thunder: 0, bait: 0, close: 0, scattered: 0, recovered: 0, thrown: 0, dodged: 0, hits: 0, glanced: 0, beast: 0, gates: 0, runes: 0, style: 0, wingovers: 0, pitch: 0, loops: 0 },
  },
  {
    name: "on the bar", engine: "chromium 143.0.7499.4",
    link: "AQQDAO1eAAAAAAAKd68C8AGIJA",
    reason: 'landed', steps: 302, total: 25, peak: 119, lights: [0],
    stats: { strikes: 0, stalls: 0, cloud: 0, reps: 0, deep: 0, trails: 0, wind: 0, thunder: 0, bait: 0, close: 0, scattered: 0, recovered: 0, thrown: 0, dodged: 0, hits: 0, glanced: 0, beast: 0, gates: 0, runes: 0, style: 0, wingovers: 0, pitch: 0, loops: 0 },
  },
  {
    name: "big ears", engine: "chromium 143.0.7499.4",
    link: "AQQEAO1eAAAAAAAKkwH4A9AdsiE",
    reason: 'landed', steps: 503, total: 25, peak: 147, lights: [0],
    stats: { strikes: 0, stalls: 0, cloud: 0, reps: 0, deep: 0, trails: 0, wind: 0, thunder: 0, bait: 0, close: 0, scattered: 0, recovered: 0, thrown: 0, dodged: 0, hits: 0, glanced: 0, beast: 0, gates: 0, runes: 0, style: 0, wingovers: 0, pitch: 0, loops: 0 },
  },
  {
    name: "wingovers", engine: "chromium 143.0.7499.4",
    link: "AQQFAO1eAAAAAAAKnAHSE-AcorQB0QnyCZEJogmRCtIJwC2SAg",
    reason: 'fog', steps: 2514, total: 25, peak: 156, lights: [0],
    stats: { strikes: 0, stalls: 0, cloud: 0, reps: 0, deep: 0, trails: 0, wind: 0, thunder: 0, bait: 0, close: 0, scattered: 0, recovered: 0, thrown: 0, dodged: 0, hits: 0, glanced: 0, beast: 0, gates: 0, runes: 0, style: 195, wingovers: 5, pitch: 0, loops: 0 },
  },
  {
    name: "TST at the keys, sky 3", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQDAAAAAAAAAABingqMRdAGxQWUBqYBpAFAZHaUAVZkRkRGVGZkhgF0pgFklgFUQoYBZNYBZNYBRJYBNKYBNMYBJFYUVhRGFBZCRhR2JOYBNJYCJIYBJIYCJLYCJIYBQrYNQtYKZIYCMhA0lgJExgE0lgEkViSWATS2ATSmASR2FDYUQpYBJOYCJIYJQrYNQoYG1AKGA8QBJkKmAZQBtgGEAaYBZHZEZkRmNFYkNhQWFEYkRiIgtgE0hgrCD_Ab1gekBOUBRECUArUBtAGlAXSlAUR1NIUBNOUBJBAxhQQ0hQlBpQikAfUCdBVB9QFk5QFUtQFElQFEtQFEtQE0lQEUEDG1ASTFAhSVCUG1DUG1BYQDhQOEAkBkZdQCNfQBshqQCTFQog_hHsAB5QS0CUD0AtYBtAKmAbQBlgGEAZYBVBAydlSmAUTGATT2ARRmFLYFQrYNQvYFpAL2AqQBlgFCFmSWAWSmAWSGAURWNGZEdjRWJEYkRhQWFFYkJkImFEYUVhRmFIYCFKYGwRjwEBKwBhKwBhLQBRKwBRKwBMEP8gbxCJAFggEQxALgAkKgAjLgASKQASJwRKUD9AlGQrYBZIAD1AGGAWLWApIDpgn0BDAStgPUAZYCdLYBRHY0lgEkZhRCVhSGAhTGCkK2DULGAvQC9gLEAeYBdIYBQBQWggPWAmLWApIDlg5CxgKkA8YFlAGGAUKWAVTGAUS2AUS2AUSWATRWJEYkRiRGNHYkMBKmAXSmAWR2VHZklgF0lgF0pgF0QnZUhgFUpgFEhgEkRhQ2FGYUdhTWAooHuQflAdkHsQfAOxLBD9IXgAWhAfAFUZACRLYCpAtA5AL1AdQClQHkAWWUATWSGrAJMaAEIdACIdADIUCVCNQCtgNCZqQC5gQ0tgMU5gESECKmAiSGASSWATSGAjSGAjTmATSGASRCFhQ2JFYkJhQmJDYUFiQ2JCYkNjQ2NDY0RkRGNDY0VkRmNDYUFhQmFCYUFhIgEmYkNiRWJFYkViRmJHYkZhQ2FGYURhSGARSmARTWAULWAcoC",
    reason: 'fog', steps: 8844, total: 245, peak: 1310, lights: [0,  0,  0,  5,  0,  0],
    stats: { strikes: 2, stalls: 0, cloud: 5, reps: 5, deep: 5, trails: 5, wind: 2, thunder: 0, bait: 0, close: 0, scattered: 2, recovered: 0, thrown: 5, dodged: 4, hits: 0, glanced: 0, beast: 3, gates: 0, runes: 0, style: 0, wingovers: 0, pitch: 0, loops: 0 },
  },
  {
    name: "TST at the keys, sky 5", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQFAAAAAAAAAAAqnweNQNAGxQWUBqYBpAFAZHaUAVZkRkRGVGZkhgF0pgFklgFUQnZUpgFEdiQmFEYkZiRWJIYBJHYktgE09gFCJKYCJPYBFFYUtgEUlgEU1gEU5gEUxgFC5gIUtgEUxgEUdhSWASSGAjSmAjRClgIkZhRWFGYUVhR2FGYUdhSGARSWART2ARRGQrYNQrYNQmakAvYCpAHWAXSmAWSmAUQgIrYBZKYBRHYkRiR2NLYBJHYktgIkhgFCtg1C5guxBvAKQoAFIvABIuACIpACIpACIoACIvABIuABItABIsABIsABIrABIqABIsABIqABIhD2BtQGVSEgpAJl5AFVdEV0RVRFZFVURURVRBAxRURVNEUkNSRFJEUkVSRlJIUBJPUBFLUDQbUNQbUH5AHVApQBRUGVAXTVAWSlAUR1JCUUNSRlJEUkZSRlFBUUZRQlFEGlAST1C0G1DUGVAoED1QJh1QKRA7UI5AVApAHlBJQBpQZBpQeQKPEawEKCDKAGwQ_yENAGUaAGMZAEIaACIfACIbACEUAR4AEhwAIhgAIRMBHAARFQEaABEWARgAERYBGQASGAAiGwARFAEZABIbABVKYCxAeFAeQCQLQBVfQCNXQVJBVUJYQBNZQBNXQ1ZCU0FRQVQDVkRYQBRWQ1RDVUNUQ1RCUUFTQ1REVkZXRlRBAxJTQ1NEVEVURVRGVEZUSFAUSFATSFASRlFDUUZSEQEbUNQaUEgQPVAmHVApEDlQ4hINQDZvQHlQFBhQGUAqUCZKUHQbUNQfUKxAJAtAShCIkKuAKAA9YCYtYC8g3gJ1LwAzKQAyKwAiKwAiKAAhIwEtABIpACItABEkASoAESYBKAAcYGlAdFISCkAkWkATV0NXQ1ZDVUJTQlRCUkFSQlRDVURSQwEUVUEPEC1QJh1QKRA5UOQZUGpAFVkgawFBHAARGwAxGgAhGwAhGQAhGQAhHgAREwwg_xDQ",
    reason: 'fog', steps: 8205, total: 105, peak: 927, lights: [0,  0,  1,  1],
    stats: { strikes: 4, stalls: 0, cloud: 0, reps: 2, deep: 2, trails: 4, wind: 1, thunder: 0, bait: 0, close: 0, scattered: 3, recovered: 1, thrown: 3, dodged: 3, hits: 0, glanced: 0, beast: 0, gates: 0, runes: 0, style: 0, wingovers: 0, pitch: 0, loops: 0 },
  },
  {
    name: "TST at the keys, sky 10", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQKAAAAAAAAAACOAdIMjUjQBsUFlAamAaQBQGR2lAFWZEZERlRmZIYBdKYBZJYBVEJ2RGYkJhQ2FCYkZjSGATSWATSWASR2JKYBJKYBJBZC5gEk5gEkhgIURhTmARTGARSWA0LmCCSmAhQ2FMYBEhAitgEURhSWARRGFIYBJNYBNIYCNOYBNNYBMhBmFKYBFJYBFPYJQrYNQoYHtAL2ApQBEDLGAXS2AXTGAWSWAVSmAUSGATR2JEYiEBJWFGYUZhS2AhS2CELmC6EIgAhCsAQykAMisAEigAIysAIiIDSVBLQGhgKkAUA0xgGkAaYBZIYBRGY0ZkSWAVS2AVRWQkSWAURmNGZEdkR2RHZEZiQmJFYkJhQmJFY0RiIgFGY0ZjRWNGY0ZjRWJDYkZjRmJEYUFhRWJFYUJhRWFDYUQnYUVhTmARTmCUKWB4ID1gJi1gKSA5YOQjb0A2WkB5YBQtYBhAKGApQBxgJU9gIkNkK2DUL2AYID1gJi1gKiDNBL5QK0C0CEB9YClAMWggKAAdQCYNQCkAOUBIYKQrYNQsYL9AFARMYChAK2AXSxEIkPmAHgA8UGlAOGA8QBQCSmAqQBtgNExgMkhgJCRhSmASTWATTmAUSmAkT2AUTmARQwEsYBRKYBNFYkRiRWJEYkRiRGJFY0hgFEpgFEZkImJGYkdhQmFGYURhRWFIYBJPYCJPYDQrYNQsYKtAJGQqYCpAHWAWSGAURmNEY0ZkR2RIYBNCAixgFUxgE0tgEk5gdCtg1Cxgr0AkC0BLYC5AKmATSCCqoBiAlJiAQpiAIpyAIpmAIpqAFgEWAR8AERkAER0AERoAERwAERkAERwAERkAERsAERgAERoAERkAERgAERkAERcBGgASGwAiHgASGQAbUGxAcmQhbkAlbEAVa0AUZkNiQ4ehj6DZYOQvYDhAfGAkK2AeQBlgKUAfYBdMYBVJYBVDZCVkR2NFY0djRGFBYUNiRGJEYkRiRGJFY0djSGATRWIiCWATTGATTWATTWAjSGBUKWC8oQtgXiB7YGhAKVA8ED5QLxDpAGUvAEMtADIqACIsACEjAS0AEisAIi8AEi4AESIBKwASLgASLAASJQsQLFDVZCdpIDtgKCG8AF5Qa0BnYUQLQCZvQBVpQBRnRWZDZUFiQWRBY0FlQWNBZAFBY0FmQWVBZkFlQWhAEm5AEmlAEmlAE2tAE2ZDY0ICIWNCYkJjQ2NEZEZlSWAVSWAUS2ATTWASTWAUK2DULmBw",
    reason: 'fog', steps: 9229, total: 355, peak: 1618, lights: [0,  0,  1,  0,  0,  0,  0],
    stats: { strikes: 3, stalls: 0, cloud: 0, reps: 5, deep: 5, trails: 5, wind: 0, thunder: 0, bait: 1, close: 1, scattered: 2, recovered: 1, thrown: 5, dodged: 4, hits: 0, glanced: 0, beast: 3, gates: 0, runes: 0, style: 0, wingovers: 0, pitch: 0, loops: 0 },
  },
  {
    name: "TST at the keys, sky 21", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQVAAAAAAAAAABU5wm1RPECogNAFKUFpAfGAUCUAqYBxAGWAXRmVHZUZkR2RHYUMBKWAUSGATRWFBYURiRWFBYURhQmFEYkhgEkZiSWASSWASR2MhAUhgIklgEkxgEktgEkpgEkxgEk1gEklgFCpgEUlgEUxgIUlghCtg1ChgaUAdYCVLYBNIYBJBAylgE0hgE0pgE0hgEkdiR2JLYBJLYBFGYUtgFCtg1Ctg1CVqQC1gKkAcYBhAGmAXSGAVQ2MhA0ZkRWNEY0VjRWJDYkRhQWFEYkViSGASSWARRmsQaAFtUFxAgwEoYBhAOGAeQBZoQBVnRmhAFmVCYiIBQ2JCYUFiRGRFY0RjRWNGY0ZjSWATS2ATTGAhIQIrYNQuYKxAGWAULWAYQBlgJUlgE0ZjSWAUS2AUTGATRCpgEklgEk5gIkxgdCtg1Ctga0AbYC9AGmARRAdGaUAUZ0NmQ2hAFGpAFWpAFWhAFmZCAiZmRmVHZUhgFUtgFUxgHCDUqIDCnYAxHgARHQAxHwAhHgAhHQAhGgAhGgAhGAAhHgARHgARHAARHQASGgAyHwASGQAiHgAZUIpAPmAkDUAqYBggPWAmLWApIDlg5CtgLEBoYDxAFANOYBxAG2AZQBlgF0hgFkdlRWNEY0FiIQEhYkVkRmRHZUpgFUtgFE9gE0lgNC5gnBB6UCkRLFAtEBgAcygAsSkAQS4AQS0AQS8AUSkAcSgAYSwAQS8AMS0AMSwAMSoAMSwALRD7IagAWxARCFBpQIQGRmhAJGlAFGpAFWpAFWdEZkVnQ2IiA0VlRGNDYkFoID1gJi1gKSA5YOQqYF9ASmA0DEAfYBpAGmAYQBlgGEAZYBdIYBdEZCVFY0JhQmNFZUdmSGAWR2VIYBZKYBVIYBQNYBRMYBJHYUZhTWB0K2DULGCKQEVkKmAaQCpgHEAWaEAUZUNlSxBtUCYdUC4Q_ABWKgByLAAiKgAxIwEpACIuACIqACIoACIoACIuABItABIsABIrABIqABIpABEiASYCKwATLQATJwRLUDZKgG-gyWDiIgxALlAdQGtgIUQOQB1gGUAbYBZNYBRLYBJIYBFGYUhgFCtg1CZoID1gJi1gKSA5YOQkbUBDWkB1ZC5gKEApYDZOYEQqYH0QeVAtEIoCBhgANRMA",
    reason: 'fog', steps: 8757, total: 210, peak: 1255, lights: [0,  0,  0,  5,  1,  0],
    stats: { strikes: 4, stalls: 0, cloud: 5, reps: 4, deep: 4, trails: 5, wind: 1, thunder: 0, bait: 0, close: 0, scattered: 5, recovered: 2, thrown: 3, dodged: 3, hits: 0, glanced: 0, beast: 3, gates: 0, runes: 0, style: 0, wingovers: 0, pitch: 0, loops: 0 },
  },
  {
    name: "TST at the keys, sky 33", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQhAAAAAAAAAABIiwrdRNAGxQWUBqYBpAFAZHaUAVZkRkRGVGZkhgF0pgFklgFUQnZEdkSWAUSWATRmJHY0xgE0tgEkhgEkRkKGASTGASTmASTmASS2AiTmA0K2DUKWA0TGAjTWATTGATSmATS2ATAS1gE0hgEUFhRmFDYURhRmJOYBJOYBFJYDQrYNQqYNFECUAtYCtAG2AXSGAWR2VGZUNkJEVjQ2FBYUJiRGJCYUJiRWJCYUNiRmNKYBNOYBJLYCQuYLUsAEcaAgIZAC9Qf0ArYDQrQChgNk9gJEpgM0JkL2AUTWATR2JEYUNhQ2FDYUNhQ2FDYUNhQ2FCYURhQWFFYkRiQ2MhAUZiQ2FCYkZjRmNFYkNiRGJDYUFhQ2JDYUJiRWNHY0ZiRGJDZCFiSWATT2ATTWAxTGBUK2DUK2CPQClgJCNsQB1gF0hgFklgF0tgF0tgFUhgESMBTWAUTGASSGAST2AhSWBUK2C4oRpgPyA4EI4AcysAYS4AESsAMSsAIS8AISwAISwAIS0AISsAISsAISsAISsAISkAISsAISkAISkAISkAISkAIS8AESkAIS8AES8AESgAIS0AESgAIS0AES0AESYBLgARKwARLAARLgARLAARLwARLQARKQAhLgARKQAhLQARLwARLQARLAARLQARLQARKwARLgARLmBeQBmAapCNUIhATFAUG1DUG1BOIGRuQBsAhB0AQx4AIxwAIxkAHFCPQC5gJCNuQC9gNE9gVC1gpEpgIiIBTWATSGASRGJGYkRiRWNHY0VjR2NFYkNhQmFDZQsgLWAmLWApIDlg5C1gKUA8YFlAGGAULmAWSmAjTmAoQBpgGUAXaEASYyEFRGhAFGdDZkJkQmVCZkNnQmNCZUJjQWJCZEJiQWJCY0FhIwRlRWVFZUVlRmVGZERhRAwgLWAmLWApIDlg5CxgWRIfBdtgTkCUCVAcQCddQBZZQBVXRFZFV0VUQgITVENTQ1REVUVURFFJAB8QHVAmHVApEDlQ5BdcQB5QdUpQI0EDHVAlTVAlSlAlT1AVTFASEgJLUBNIUBNKUBNJUBJGUklQEkhQEUJRSFARQ1FLUBFBAx5Qn5FMUCedEWkALhBPAJMvAEIrADEnASsAIi4AMSQBKwAhKQARLgARKgARLgASKwAyKwAiLgAiKwAiKwAiKgAiKgAiLwASJwInAyoAEiUBIwElAisAEy4AEygAE",
    reason: 'fog', steps: 8797, total: 180, peak: 1291, lights: [0,  0,  0,  1,  5,  0],
    stats: { strikes: 3, stalls: 0, cloud: 5, reps: 3, deep: 3, trails: 5, wind: 2, thunder: 0, bait: 0, close: 0, scattered: 2, recovered: 1, thrown: 3, dodged: 3, hits: 0, glanced: 0, beast: 3, gates: 0, runes: 0, style: 0, wingovers: 0, pitch: 0, loops: 0 },
  },
  {
    name: "TST at the keys, sky 35", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQjAAAAAAAAAACBAegLhEfRAZACogHQARSlBOQJMBLmAaQCtgGUAYYBZHZUdkRmRIYBQBTGAVSmATRWJGY0pgE0lgEkVhQ2FFYURhRGFFYURhIQIqYBJNYBJMYBFDYUtgEktgIklgMUNkK2DUKGBjSmAySWAST2ASRCxgEUFhSmASTWASTGASSGAhQ2FKYCFLYBQrYNQrYNQibEAfYCdOYBVJYBNGY0hgFEpgEUMBLGAUS2ATSmASSGARQ2FMYBJOYEQuYLwRKgBYYG1ASFAsQBQJQB1QHEAaUBdHVEVTQ1FBUUJSRFNFUkJSRVREFVRGU0NRQVFCUkRSQlFCUkRSQ1JEU0dUSFAUSFATRVJEUkFUEkdTR1NHUkNRQlFEUkVSRlNLUBRJUCRLUBQbUNQbUNQfUBxAG1A3SFAlRVZFVkNREwFDVERWRFRDU0NTRFRGVEtQE01QRBtQ1BlQ0kQOQEddEGqRGxCqAJMqAEIsACItACIoACIjDmB7QDxQJEQIQC9QGUAeUBZJUCNJUBJOUBJEG1AiSlAST1ASSFAiSVAiTFASRlQRRVFFUklQE0lQE0dSQ1JHVEpQFUtQFEhQE0NUEkdTSlATSFASRlFCUUZRRFFEUUhQEUZRT1ARTVAUG1DUG1DUHFAtILwAVxgAYxsAIh4AEh8AEh4AEhwAEh0AEhsAEhEIIJxgOyA6EgoAZi4ASmBpQHZUCkAkW0AUW0AUWUAUV0NVQlNCVENWRFNDARRVQ1RDVERVRFRDU0NSQVFCU0RTRFRGVEZTRFJFU0FUFVNLUBNOUBJLUCFJUGQaUM-RWVDhEw1AGGA6QFpQMkQHSVAzSFCUG1CYEXgAoioAMiwAIikAMi8AIi8AIi8AIi8AIi4AIi8AIi8AIScBKgAiLABCKQBRKAAhLwAhKwAhLQAhKgAhLAAhKQAhLAAcEP8geVDkG1DUF1tALGAtQHQIQDxQHUApUBxAFldEVUNTQVESARFSQlJCU0NURFVFVUVVRFNDUkFRQlFBUkRUR1VIUBNEUkJUEkdTSVAVRlJGUUpQhBtQ1BlQukAkBUtgG0C0C0BOUCpAL1AbQBZUFFZJUBVKUBNFUUJRQ1FEUktQE01QIk5QFBpQvZEMUEoQu1BdQBFrAEpAPgKcIP8Ag",
    reason: 'fog', steps: 9092, total: 322.5, peak: 1512, lights: [0,  0,  0,  0,  0,  4,  0],
    stats: { strikes: 0, stalls: 0, cloud: 6, reps: 6, deep: 5, trails: 5, wind: 2, thunder: 0, bait: 0, close: 1, scattered: 0, recovered: 0, thrown: 6, dodged: 5, hits: 0, glanced: 0, beast: 3, gates: 0, runes: 0, style: 0, wingovers: 0, pitch: 0, loops: 0 },
  },
  {
    name: "collector at the keys, sky 4", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQEAAAAAAAAAABz2geNQdAGxQWUBqYBpAFAZHaUAVZkRkRGVGZkhgF0pgFklgFUQnZEZiQ2JFYkRhQWFEYkZjS2ATSWASSGASSmARQmFFYyEMYBJIYCJNYBFEYU1gEk1gMkpgFClgk0pgMkNkKGAiT2ASTmASTGASTWASTGASTWARIgEuYDFLYBFIYIQrYNQpYG1AGGA4QB1gFCVMYBVMYBRJYBNHYkZiRmJJYBJIYBFEYUdiIQErYNQoYJ-hL5CUiJAtgFygK4CqkB-BJq5QekApYEQhbEAvYDxALGAfQBZiRAVFbEAUbUAUaUAkaUAkbkATZUECIQNCZUJkQmNCZURnRWdFZkVlRGRDYkJiQ2RGZUQmZkxgFUtgFE1gE0xgEkpgEk1gIyELYNQrYItAH2AmQgIoYCdKYBRFY0ZkR2NEY0djTqB_lBuAnZAvoY-AJayRPGDTQlQRWaIrkP6huYA_kBuAWJAbgCecgBaXhpaIkBOFkYeRiJC4gGigP4BqkGWPQEZcQIQMQEhgOkAtYBlAF2IiA0hgFEZiQ2FBYUVjSmATSWASSGASTGASTmASRmQib6D6YF0gPWAuIL1gKUApUDpAZA9APWAdQClgG0AYYBpAFGQnR2ZGZERjRWRFY0VkSGAUR2NIYBNLYBEjC2DUK2DUKmBNQBiSKWC0TFAkG1DUGVB-ED9QGBAuUDtALGAsQFQJQFZcYHQuYHVdYC0gOGAtIZEOYDtAoQMWXUAoUB9AF1pAFllAFVVCUUFTQ1RBUhICRFVFVkVVRFZDWEAUWkAUWEATVkNWQ1VCURMCUkJTQ1JBUUJSRFNJUBJKUEiQvlAZkduAWpAcoG",
    reason: 'fog', steps: 8333, total: 287.5, peak: 986, lights: [0,  0,  4,  0],
    stats: { strikes: 0, stalls: 0, cloud: 4, reps: 2, deep: 1, trails: 5, wind: 1, thunder: 0, bait: 0, close: 0, scattered: 0, recovered: 0, thrown: 4, dodged: 4, hits: 0, glanced: 0, beast: 0, gates: 0, runes: 0, style: 0, wingovers: 0, pitch: 0, loops: 0 },
  },
  {
    name: "collector at the keys, sky 12", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQMAAAAAAAAAADeAY0JikPQBsUFlAamAaQBQGR2lAFWZEZERlRmZIYBdKYBZJYBVEJ2RHY0ViRGFBYURiRmJFYkhgE01gEkVhRmJLYBMhAUhgI0xgI09gEklgEUNhSWARRWFHYUdhQWQsYBJKYCJPYBJJYCJKYCFIYBFJYBQrYNQrYNQqQB9gJ0lgJk5gFEhgE0hgEkNhQWMhBmJIYBJGYURhRGFHYktgIUhgEUpgRCtg1C9gnUAnZC1gHEAbYBdHZkdmQ2iguIBKkNKMoEqA1aiAIa2BW2B8QC5QNEQKQDpQL0AdUBpAGlAYQBdREwJGVERTQ1JDU0RTRFNEUkNSRFNHVEpQFEpQEkNRRFESAR9QEklQEUdRSyDpYOQrYLFPYBQrYEJOUIQZUN4QP1AZEIReQCxgK0CEC0DIUBQeUD0QSpI4gE2hE4iQSYBNAHtgeEAeUFQbUNQfUEtASlA3RAVIUCtAG1AZQBpQGEAZUBZJUBVHUUICFVNIUBRLUBRMUBNLUBNIUCJKUCFGVBtQ1BlQykAUCEAfUCtAHFAWR1RGVEdURVJDUkNSEgFJUBRJUBNJUBNMUBNPUCJNUDQbUNQbUNQWXEA7YB5AdAtA1A5AGFA8QC9QHUAdUBhAFBhQFktQFEhQE0lQE01QEklQEUpQEUtQJBtQ1B5QapEJUMhAJANGaEA6UJQbUFgQPVAmHVAuELmQqYD5oB-AKKEIgEqQPoBOkCqAfSAqYF-AOJC-UKtANA1AOVBNQB1QJ0RUG1DUG1DSEgpALVAsQB5QGEAaUBZHVEZRQwEYUBVIUBNEUkRRQVFDUUFRRVNKUBNKUBNOUCFHVBtQ1BlQHZCPUBiRTKFbkx2AI",
    reason: 'fog', steps: 8586, total: 555, peak: 1165, lights: [0,  0,  4,  1,  0],
    stats: { strikes: 1, stalls: 0, cloud: 19, reps: 4, deep: 4, trails: 4, wind: 1, thunder: 1, bait: 0, close: 0, scattered: 1, recovered: 1, thrown: 4, dodged: 4, hits: 0, glanced: 0, beast: 3, gates: 1, runes: 1, style: 0, wingovers: 0, pitch: 0, loops: 0 },
  },
  {
    name: "holding its line at the keys, sky 7", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQHAAAAAAAAAABkygveRtAGxQWUBqYBpAFAZHaUAVZkRkRGVGZkhgF0pgFklgFUQnZEdkSmAVTWAUS2ATTGATT2ATRmQtYBNLYCNJYCNJYCNLYCJIYBEhAixgEURhSmASSWAiS2ASSWAiSGAhSGARRCtg1Ctg1C1gHUAYYDhAH2AWS2AUR2NDZCJFYUFhRGJGY0pgE0pgEkZhRGFIYBJOYDFEZCtg1Cxgx0QPQB1gL0AcYBtAGGAYQBRoIJ4AZRwAUh8AEh8AIhkAIhsAIh8AEhkAIh0AEhgAIh4AEhYETWAoQLQIQEpQK0AsUBxAGFAWQQMTVUVVRVVFVERURlZIUBZIUBVGU0RSQ1JDUQIRA1FCUUJRQlFDUkZTSVATSlATSVAiTFBEG1DUHVCYQC5QGRA9UCYdUCkQPlDLQBQKQClQtBtQ1B5Qb0AoYC5AFAtAZWpAKSGLAFkQPVAmHVApEDlQ5B1Qt0dkK2DUK2DUK2AmSmBFSmAlTWAUQ2QiYkRhQmJHY0djR2NHZEpgFEdjRmNGY0dkRCdjRGJGY0diRGJHYkZiSWASSWARRWFIYCFGZCtg1CJvIO0FYywAMioAIiwAISMBLQASKwAiLgASKgAiIw1gaUBnVEQNQBVbQBRYQBRXRFVCUkJUQ1NCU0NURFREVEJSEgFEUkJSQ1NFU0NRQVFCUkVUSVAUSlAUSFAjSVAiEQEbUNQdUJtAG1AkElZNUBVMUBRIUBNGUkVSRVFBUURRQVFGU0xQE0QeUBJLUCFPUIQbUNQYUF5ALlArQBxQEhIFSVAURVNGVEhQFEdSQlFEUkZSRlJFUkNSRFNGVBFSSFDUG1DUGFAZEIgBQSkAYSsAYSgAYSsATUAkAh1QKxDMAFFLUCpAgVpANA9Af2ArQCJkKGAaQBpgGUAbYBhAG2AWSmAVS2AURGQlY05gEktgEUtgEUtgdCtg1Cpgb0A4YDJECEAZYCpAHmAYQBxgFUlgE0djS2ATAStgIkxgIUlgaCA9YCYtYCkgOWDkLGBJQDtQG0BEDkA_YBxAOmARTyEbAFgQGwBkGgAzHAAjHQAjGwAiGQARFAEYABEUARgAERQBFwEWARUBGAARFQEZABIZACESAR0AEh0AIRMBGAAhFwEdABEYABEbABIeACIeABIeAB",
    reason: 'fog', steps: 9054, total: 250, peak: 1482, lights: [0,  0,  1,  4,  0,  1],
    stats: { strikes: 4, stalls: 0, cloud: 5, reps: 6, deep: 6, trails: 5, wind: 2, thunder: 0, bait: 0, close: 0, scattered: 4, recovered: 1, thrown: 4, dodged: 0, hits: 3, glanced: 0, beast: 1, gates: 0, runes: 0, style: 0, wingovers: 0, pitch: 0, loops: 0 },
  },
  {
    name: "holding its line and taking Algiz at the keys, sky 1", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQBAAAAAAAAAABUpgq7RNAGxQWUBqYBpAFAZHaUAVZkRkRGVGZkhgF0pgFklgFUQnZEZjR2NFYkViRWJGYkdjTmAUTGAhIw5gI0lgMktgIUpgIUhgJChgtE9gFCFiTGASSGASSWASSGASR2JIYBNMYBROYBRFZCpgE05gEktgIklgdCtg1Cxgi0A8YBQnbUAcYBpAGmAXRmZHZUVlR2VCZCFjRGJDYUFhQ2JEYkZjSWASSGASSmBkLmC-IP8EEykAQi0AIi4AIy0AEi4AEigAIi4AEioAIigAIi4AIi8AIScBLAAiKABCLwAhJgEpACEpABEpAB5gW0CEA0VaQCReQBRaQBRbQBRYQBRZQBRVQQMUQ1ZEV0RVQ1NBUUFSQlJBUkNVRVZGVUVURFJBUUNTQ1ISA1FCUkVSRFJFUkZSR1JLUBJLUC4g6WDkKWCaACYRXGAmLGAhRQwQKVDkHFC_QBQIQBxgH0CkD0DEVBNRTQENIgsCrVB-QC5gNCJqQC5gNUtgIkdiTmATRWQoYBNHYkViRWNIYBRJYBNEYkViRGNIYBRHZEViIgFGY0RiQ2JEY0VjRWRHZUhgFEViQmFDYkRiRWNJYBMBLWATTGAiTWCEK2DULWBuQD1gI0QHTWAZQBhgGEAVa0AUakAUakAUaUAVZAVGZ0ZkRmJFYUlghCtg1Cxgx0QLQI9gKUAjAS5gHEAaYBhAGWAWR2VHZEZkR2REZCNHY0diRGFCYURiSmASS2ART2ART2A0K2DUKmBWGSH6AGUZAFIdABEYABEaABEZABEXARoAEhoAIhsAERQBGAARFAEYABIdABIZABIcABISA0tgPUCWVBZZQCtQG0AaUBlAGVAXSFAXSFAUQQMTVEVURVRFU0NTRVRFVEZURlRGVEZTRFJDUkQRUkRSRFJEUkRSRVNIUBNIUBNJUBJGUUJRSFARRFFMUBFCVBtQ1BtQ1BdaQCxQKkAcUBdIUBVGVEZUQQMWVEVTRFJDUkRSQ1FBUURTSFATR1NKUBJGUk1QEkNUG1DUG1DUGlArQBoQygDhLAB9QCYNUCoQrADxKQAhKQBBKgAxKwAxKQAxKQAxKAAxLwAhLgAhLwAhLAAhLgAhKgAhLQAhKQAhJQoQs",
    reason: 'fog', steps: 8763, total: 210, peak: 1318, lights: [0,  0,  5,  0,  0,  5],
    stats: { strikes: 2, stalls: 0, cloud: 8, reps: 5, deep: 5, trails: 4, wind: 0, thunder: 0, bait: 0, close: 0, scattered: 1, recovered: 0, thrown: 4, dodged: 2, hits: 1, glanced: 1, beast: 3, gates: 1, runes: 2, style: 0, wingovers: 0, pitch: 0, loops: 0 },
  },
  {
    name: "TST pulling its ears out of lift at the keys, sky 8", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQIAAAAAAAAAAA41wmkRNAGxQWUBqYBpAFAZHaUAVZkRkRGVGZkhgF0pgFklgFUQoYBZNYBZNYBRKYBNJYBNNYBNNYBNEKWAjTmATSGAjT2ASS2ARRWFNYBFCZCtg1Ctg1ChgGEAdYCZJYCVNYBRJYBJDYURiRGMhAUpgE0tgEkdiT2ARRGFKYGQrYNQuYJ5AJ2QsYBxAHWAaQBtgGEAYYBZGZERjRGNDYSMGY0VjRmNHY0lgEkhgEUZhT2A6IGsAgxwAUh8AMhwAMhgAMRQBGAAiHQAiGAAiGAAiHAASHAAREgEYABEUARcCEQRJYEpAb1AbQBQCTFAbQBxQGEAbUBZKUBVIUBRHVEdREwFIUBVJUBVHVEVSQlJFVEhQFUhQFUlQFUdRQgIUU0ZUSFAVSVAVSVAUR1NGU0hQE0lQE0hQFBFGUUlQEUpQIU5QhBtQ1BtQS0AvUCtAGFAjRAFOUBhAHlAXTVAWTlAUSVASRVFEUURREQIbUBFJUBFNUKQbUK4gamApIU2gK4DfAJPMAC0gHAAlTFAaQKtgE0QIQDVqQCRpQCNoQBJmQmdDaEARAyFnQ2dEZ0NlQ2VDZEJjQmNCYkFhQWJBYUFiQmJBYkNlRWZFYSMDR2dJYBdJYBZKYBZMYBVMYBRKYBQjYktgIUpgpCtg1C9gHUArYC1AFWogvgCCHABRGAAxHQAxGQAxGwAxGQAxGAAxGAAxGAAiHQBCGQA3wdfB3cAi2sAy3MAy28Ay2cAx1cHZwCHUxQEeABEcABEfABEeABEWDCD4ENrRGsBeAOlgaUB2UUQJQCVdQBRXQlNCVUJTQlVDVUNTRQsQLVAmHVApEDlQyEAkC1DGQlQfUDNKUBJLUBJHUUJRRlJHUkVSR1JEUgIYUBNHUkVSRVJHU0lQE0hQEkVSR1JHUkdRQVFGUhIKUCJPUKQaUHyRCVDkHlAfQBxgOkBkAk9QH0AlUR8ALUAYUBYdUCkQPlDbIH8BIRgAIR0AMR0AIRwAIRkAIRkAIR0AER0AERoAERoAERMIUIhAOWAxIwxAK2AlT2B0KGDLQBQBSAA9QCYNQCkAOEA4YEhAKGApQB9gEUQKYCNOYCFPYHQrYNQoYE5AHmAoQB5gFktgESMCTGAVTGAUSmATSWASSWARQmFPYBFLYCQrYNQqYDwgKqBJYCugSIDcAQ",
    reason: 'fog', steps: 8740, total: 140, peak: 1239, lights: [0,  0,  4,  5,  1],
    stats: { strikes: 3, stalls: 0, cloud: 9, reps: 6, deep: 5, trails: 5, wind: 1, thunder: 0, bait: 0, close: 0, scattered: 4, recovered: 3, thrown: 4, dodged: 4, hits: 0, glanced: 0, beast: 3, gates: 0, runes: 0, style: 0, wingovers: 0, pitch: 0, loops: 0 },
  },
  {
    name: "TST never catching its wing at the keys, sky 2", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQCAAAAAAAAAABSmAegQNAG8QmAApIXgAHCByDCNPAB0gNwsgJQogJAogIwsgIg0i7wBLIY4AZR0AUxsAMxoAMxwAIhoAEh0AEhoAEhsAEhkAEhYOIHoALREKABwQNwkQJQ4QFA4QFAwQJA4QIwoQIg4QEg4QMQ0SqgBKEDgAKhAjDRFOAJIuADErABEoACErABErABEqABEpABEpABEoABEoABEnAScBJwEnAi8AEigAESQBJQElASQBJQEkASQBJAEjASUBIgElASIBJQInAiYCJgMqABMmAykAFCgAEyYDJgMmBCkAFSkAFSMLIN0ALxB9ABsQzZDvEssAoSwAISkAUSgAQSwAMSoAISwAMS8AIS0AMS8AMSsAQSkAQS0AMS4AMSsAMSsAMSoAMSoAMS8AISgQ6SFtAGUeAEMbADIYACIRCiB6ADkQXQApEDkAGhAmDxAVDxAUChATCxATDRASCxASDhIskO8Q6gBYELMLEhoAOhBuIcoAkh0AMRYOIN4RTwIWFA0gfQAqEJgAKRBXDhAlDxAVDhAUDxATDxARAhENEBEJEBEPECEMEXkhKABugKigKiAw",
    reason: 'fog', steps: 8224, total: 205, peak: 920, lights: [0,  0,  0,  1],
    stats: { strikes: 1, stalls: 0, cloud: 1, reps: 3, deep: 3, trails: 5, wind: 2, thunder: 0, bait: 0, close: 3, scattered: 1, recovered: 0, thrown: 5, dodged: 1, hits: 1, glanced: 0, beast: 0, gates: 0, runes: 0, style: 0, wingovers: 0, pitch: 0, loops: 0 },
  },
  {
    name: "TST flying wingovers at the keys, sky 6", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQGAAAAAAAAAABBkwevQNAGxQWUBqYBpAFAZHaUAVZkRkRGVGZkhgF0pgFklgFUQnZUpgFEhgFEpgE0hgE0xgE05gEkhgEUVhAy9gEklgIkpgIkpgIUVhSGAhSGARRChgMk9gEkxgEktgEklgEkpgEkdhRGJEL2ATTmASS2ASSWAiSWBUK2DUKmDJQBQKQBhgPUAdYBdHZUdlR2VEYyEDSGAVSmAVTGAVSWAkTmBOIWsQHVAoEF8gjRKKIJ8QjyCNAJgQOwJyLwBhLAAhLgAxKAAxKgAxLwAhKQAxLgAhLwAhLQAhLgAhKwAhKgARJQEtABEpABEtABEqABEtABEqABEvABEtABErACEtACEnT1AeQGNaQEEPISkAgxoAURgAER8AIR4AERoAIR4AERkAIR4AER8AER4AER0AER4AERwAER4AERsAER0AERoAER0AERoAERsAERsAERkAERsAERkAERkAERoAERgAERkAERkAERcBGgASGwAiHAARFAEaABIfABIcABIcABESARgAERQBFwIdABIZABIcABIaABESDVBsQHQERmpAJGlAE2hAFGpAFGZCY0JkQ2ZDZENhQwEiY0JiQWFBYUFiQmNEZURjQ2NEY0VkSGATSGATSmA0LmBZIQwCZCkAIysAIy8AEy4AEiYCKwATLgATKQAVSFA-QJZkJGhAKWAbQBhgGEAXaEAYYBhAF2ZFYkMBJmdHZ0dnR2dHZkggPWAmLWApIDtgzkAUC0AYYMQrYNQtYB5AtAhArGAnRAlAHWAcQBpgGUAaYBhAG2AVR2NGYkJjIQZhRGFIYBFMYHqhGGAtIR8B0RoAkR4AgR4AcRoAcRoAYR4AP1BdQGdmRAhAJm9AFWpAFGdDZUJiQWJBYkJlRGdEZEICI2VDY0JjQmJBYUFiQmJCZERkQ2NDY0NiQWFCYkJiQ2NFZEVjRGNEYiIBR2NGY0hgE0pgE0tgEklgEk2g_GBqID5gLyCcYDtALlAsQFQMQE1gHUAqYBxAF2hAFCRoQBhgF0hgF0lgFkhgFUdjRGJFY0lgE0FkKmATTmC0K2DULGAcIM",
    reason: 'fog', steps: 8239, total: 162.5, peak: 915, lights: [0,  1,  0,  0],
    stats: { strikes: 1, stalls: 0, cloud: 0, reps: 2, deep: 0, trails: 5, wind: 1, thunder: 0, bait: 0, close: 0, scattered: 0, recovered: 0, thrown: 2, dodged: 2, hits: 0, glanced: 0, beast: 0, gates: 0, runes: 0, style: 60, wingovers: 3, pitch: 0, loops: 0 },
  },
  {
    name: "TST pitching its wing at the keys, sky 9", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQJAAAAAAAAAACSAeAK4UXQBsUFlAamAaQBQGR2lAFWZEZERlRmZIYBdKYBZJYBVEJ2RGYkNhQWFEYkRhQmFCYUNhQ2FCYUViSGATT2ATTmASQmQsYBJNYBFDYUpgEUVhSGARR2FIYBFHYUtgEUhgEUNkL2ASTWAiT2ASTmASTWARQ2FLYBJDZCtgMk5glCtg1Ctge0AfYCZIYBQiY0hgE0lgE0hgEkRhQ2FDYUNhRGFDYURhRGFEYUVhRWFGYUhgEUQrYNggjGC5IEwAVREMQKsArUBRX0BIACogPQA1LgCOEGpQLBDpUOQbUB9AKVA6QB5QF0xQFUICHVAYQB9QF0xQFUpQFUxQFUtQFEQaUBNHUkZRQ1FEUUVRRVFGUUlQEUtQEUxQNBtQ1BpQLJEDXyAbYC4gPQAoEC0AoxgAMhoAIhoAIhoAIhgAIh8AEh8AEh0AEh4AEhwAEh0AEh0AHlBoQHNjIQlAJGtAFGlAFGlAFWlAFWhAFWZEZUJiIgJEZERkQ2JCYkNjRGJCYkRjR2RKYBNJYBJKYBJKYBQrYNQqYMlAFAJKYDlAGWAnSGAXRmZGZkViQgIiY0RkRWNDYkRjRmNJYBNOYBJNYEQrYHohfQAvgPoCLmBbQIQNQChQHkAnXEAVV0VXRFNCU0FSEgFDUkFRQlNEVUdWR1RFUkJRQlFCUUJRQ1JGUkZSR1FDUUZRQlQbUBFPULQaUNFECUAYUDlAGFAmSlAUSFAUSFAURVQSVExQE0dSRlKRi5CoED1QJh1QKRA8kJwRuQBeYFpALRHoAGcuAFQrACMtABMtABMpABIjT1A9QExgPUARZClgKEAeYBZJYBZJYBdIYBhAF2hAFCJmQ2RCY0JkQmRBYUFiQWNCZkJkQWJBZEJpQBNsQBJlQWVBY0FkAkJpQBNsQBRrQBVrQBVnQ2RCY0NmRWdDYiICQ2NDY0NjQ2NEZEVkRWRGZEZkQ2yg-WDkL2BqQDpQGEAkC0BdYC5ALmAXRAJLYBpAGmAYQBdlRWRFZUdmR2VFZEFkIkJiQ2JDY0VkRWJCYkRiQmFCYkVjRmNGY0hgEkViSmASQmQoYMsQ7wKDGwAiGgAiEQwg-xHbAOlgaUBnWEAUDEAVXEATVUJcYIQtYJ0gOGArIG",
    reason: 'fog', steps: 8929, total: 365, peak: 1376, lights: [0,  0,  0,  0,  1,  4],
    stats: { strikes: 1, stalls: 0, cloud: 7, reps: 4, deep: 4, trails: 5, wind: 3, thunder: 0, bait: 0, close: 0, scattered: 1, recovered: 0, thrown: 6, dodged: 6, hits: 0, glanced: 0, beast: 3, gates: 0, runes: 0, style: 125, wingovers: 0, pitch: 51, loops: 0 },
  },
  {
    name: "TST flying wingovers into loops at the keys, sky 11", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQLAAAAAAAAAABiigrxRNAGxQWUBqYBpAFAZHaUAVZkRkRGVGZkhgF0pgFklgFUQnZEdkSWAUSWATR2JEYURiSWASR2JLYBNGZC1gEklgEURhSmASSWAiSmAiSmA0KWCySGAkKWAiTWAiTmASTGASTGASS2ASSGATIQFLYCJLYBFIYBFNYBFKYGQrYNQpYKhAKmAUKGApQBhgJktgFUtgFEhgE0diRWJCaCF8EJ8gjxCPIIFIAFGOAGFOAIGKAHFOAJGNAj8QOQFCLQBBLQARLwAhKAAhKwAhLwARKgAhLQARKQAhLQARLQARLgARLAARKwARLQARKQARLAARKAARKwARKQARKAARKgARKQARIg5gbkBcUBFEDEA2XkAlWUAzWUARUkFVQQIRBkNaQBRZQBVZQBdZQBhQF0hQFklQFENTEQFGU0pQFEhQI0hQIktQIUpQNBtQ1BhQSUAfUCZIUCVNUBNBAxtQFExQE0hQEkdSSlASS1ASS1AiTFAUG1DUH1DERAZJUDhAHlAWS1AVSlAVSlAUQ1QSRlJEUkdTS1ASRlJJUCJJUFQfUF0Q_QBJgQoA3lB7QGQOQIhgN0ZkK2DUJWggPWAmLWApIDlg5CpgPUAqUCpAVApALWAcQChgGkAVZkVmRGNCYkFhQmFBAiEBRGREYkFhQmJEZEZjQ2JFZElgFEhgE0diR2FCYUhgEUJkK2DUK2DRIwlALWAtQBxgGEAXa0AVbEARZCtAE2dDakATZ0JkQWJBYkFjQmVDZUJsEK8AkikAUSgAHBD_IWwAkh4AQRkAIRoAMRwAIR4AIRsAIRwAIRkAIRsAIRgAIRkAIR0AFkxgL0CkDUBeUB9ANVxAEwETWEAkUUgAPUAmDUAqACcYUHxAHVBUG1DUHFB_QBhQOEARAx5QF0tQFUlQFUpQFEdTRlNIUBNHUkNSEQEVUktQEktQEkpQlB5QbZBboF5gHKDLIHgB0iVIUDxAoQMoYCxALWAaQBhgF0dmRmVGY0ICJWVFY0RkRWRGZUZkRmVHZEVjRGJDYkRjQ2MhAkdjQ2-g6WDkLWBdQDdaQDQOQCxgOUAQ",
    reason: 'fog', steps: 8817, total: 245, peak: 1290, lights: [0,  0,  1,  1,  0,  0],
    stats: { strikes: 2, stalls: 0, cloud: 0, reps: 5, deep: 5, trails: 4, wind: 1, thunder: 0, bait: 0, close: 1, scattered: 3, recovered: 1, thrown: 4, dodged: 3, hits: 0, glanced: 0, beast: 3, gates: 0, runes: 0, style: 525, wingovers: 3, pitch: 0, loops: 3 },
  },
  {
    name: "TST pitching its wing too long at the keys, collapsing it and pumping it open, sky 17", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQRAAAAAAAAAAAU0wedQdAGxQWUBqYBpAFAZHaUAVZkRkRGVGZkhgF0pgFklgFUQoYBVJYBRIYBNGYkViRmJHYkdiSGARQmFFYUViRGQoYBJJYBJLYBNIYCNNYBJJYBFEYUlgEkxgFC1gIU1gpCtg1C9gLUAYYDlAH2AWSWAURGMhAURiRGJEYUFhQ2JGY0hgE0diR2JJYBJOYBJJYCQrYNQrYNMpADwgSWA4QD5gHkAbYBRHDCCXa0BkXkAoADIcABEYABEaABEYABEZABEVAkFaQBFbQBFbQBFaQBFaQBFbQBFZQBFSSQASHgASHAASGwASGgASGgASFgNCXEASXUASXkASXEAeUCkQSwBqQEtgL0AjaiAVCyAhDyBtYCYtYCEpYOQrYJhARA1AjGA6QBQHTmAcQBtgGkAcYB5AFWlAJGFED0ATakAibEARY0FoQBJrQBNqQBNmQ2ZEJERlRWVHZUZjQ2FCYkRiRWNJYBNMYBJPYBQuYHsgH6BoYCuggY0CBC0AMy0AIioAEi8AEisAEisAEisAEikAEioAEy8AEysAEycESVA9QJdkJWtAK2AbQBlgGUAZYBhAGGAXR2RCAiVlRWVGZkdmRmVFZEVkRWREY0VlR2QBSGAVR2VIYBRGY0VjR2NHY0lgEkViTGASRCtg1Ctg1ClgP0AoYD1AGGAmRAZIYB9AF29AFmxAFWpAFmlAFmJECWAVSmAUTWBaIEdtQB8ANhsAYxwAMxsAMx0AIxoAIhcBFAEWARQBFgEUARYCEQxQc5yAOKB4ID1gJi1gKSA5YOQuYD1AQ11ARAlAKmA6QC5gG0AaYBdEYyEDRWRFZEVkRmVGZEVkRmVHZUdkRWREZCNFYkNhQWFCY0JkQmNDY0lgEkpgdCtg1CxgTCEcADxQXUCECUAVaEAkbUAcUHQdUIkQKSIaAPEfACEYACEZADEdACEYADEdACEcADEZAEEbAGEZAGEfAFEcAFEUCBEKAFkgGQA_EPghHGArIKoAdBoAQhoAGlBrQGZmRAtAFGxAE2dDZ0ViQmJDZEFhQWNBYkFkQmRIAD1AJg1AKRA-UClALWCFRANIYNQrYNQkaUAsYClAGmAVRmRGY0NiQW",
    reason: 'fog', steps: 8349, total: 50, peak: 979, lights: [0,  0,  5,  5],
    stats: { strikes: 2, stalls: 0, cloud: 19, reps: 3, deep: 3, trails: 4, wind: 0, thunder: 1, bait: 0, close: 0, scattered: 3, recovered: 0, thrown: 4, dodged: 4, hits: 0, glanced: 0, beast: 0, gates: 0, runes: 0, style: 0, wingovers: 0, pitch: 0, loops: 0 },
  },
]);

test('runs flown in a browser replay in Node to the very sheet the browser showed', () => {
  assert.equal(GOLDEN.length, 21);
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
