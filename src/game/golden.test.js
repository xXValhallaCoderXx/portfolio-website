import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeLog } from './recorder.js';
import { replayLog } from './replay.js';
import { SIM_VERSION } from './sim-version.js';

// Runs of Good Lift as their challenge links, each with the sheet a browser came to for it: five
// flown in Chromium on keys alone (one of them down out of the launch column with the big ears, E,
// opened again by the brake, and one climbing in the column and then flying a set of wingovers,
// which lands its style), and fourteen flown in Node by the reference pilots at the keys (with
// kettlebells and close calls, the Beast, a blessing taken and a bell turned aside by Algiz, plates
// off the sky, doubled lifts and climbs to 1,500 m, TST pulling its ears out of lift, a pilot that
// never catches its wing, which tucks, and TST flying wingovers and pitching its wing, each landing
// its style) that Chromium replayed to the same sheets (.artifacts/flight-qa/golden-qa.mjs does
// both, and node-goldens.mjs beside it records the Node ones). All are SIM_VERSION 4's. Replayed
// here they must come to the very same sheet, style and all: if one does not, either how a run
// flies has changed without a new SIM_VERSION, or Node's maths and the browser's part ways, and
// every link shared would replay differently from how it was flown. Record them afresh with each
// new SIM_VERSION.
const GOLDEN = Object.freeze([
  {
    name: "column, eased", engine: "chromium 143.0.7499.4",
    link: "AQRKOywdAAAAAAAUpgLAIqAZ0kO2CdJDtgnS4gGQHoF0",
    reason: 'fog', steps: 4416, total: 50, peak: 294, lights: [0,  0],
    stats: { strikes: 0, stalls: 0, cloud: 0, reps: 0, deep: 0, trails: 1, wind: 0, thunder: 0, bait: 0, close: 0, scattered: 0, recovered: 0, thrown: 0, dodged: 0, hits: 0, glanced: 0, beast: 0, gates: 0, runes: 0, style: 0, wingovers: 0, pitch: 0 },
  },
  {
    name: "column, the other way", engine: "chromium 143.0.7499.4",
    link: "AQTu_8AAAAAAAAAWsALqI5AbkawCgrwBuC7SCw",
    reason: 'fog', steps: 4586, total: 55, peak: 304, lights: [0,  0],
    stats: { strikes: 0, stalls: 0, cloud: 0, reps: 0, deep: 0, trails: 1, wind: 0, thunder: 0, bait: 0, close: 0, scattered: 0, recovered: 0, thrown: 0, dodged: 0, hits: 0, glanced: 0, beast: 0, gates: 0, runes: 0, style: 0, wingovers: 0, pitch: 0 },
  },
  {
    name: "on the bar", engine: "chromium 143.0.7499.4",
    link: "AQQDAO1eAAAAAAAKd68C8AGIJA",
    reason: 'landed', steps: 302, total: 25, peak: 119, lights: [0],
    stats: { strikes: 0, stalls: 0, cloud: 0, reps: 0, deep: 0, trails: 0, wind: 0, thunder: 0, bait: 0, close: 0, scattered: 0, recovered: 0, thrown: 0, dodged: 0, hits: 0, glanced: 0, beast: 0, gates: 0, runes: 0, style: 0, wingovers: 0, pitch: 0 },
  },
  {
    name: "big ears", engine: "chromium 143.0.7499.4",
    link: "AQQEAO1eAAAAAAAKswKkHqAZouIBgBf8Hr0XhAXhlgE",
    reason: 'quit', steps: 3876, total: 25, peak: 307, lights: [0],
    stats: { strikes: 0, stalls: 0, cloud: 0, reps: 0, deep: 0, trails: 2, wind: 0, thunder: 0, bait: 0, close: 0, scattered: 0, recovered: 0, thrown: 0, dodged: 0, hits: 0, glanced: 0, beast: 0, gates: 0, runes: 0, style: 0, wingovers: 0, pitch: 0 },
  },
  {
    name: "wingovers", engine: "chromium 143.0.7499.4",
    link: "AQQFAO1eAAAAAAAKqALiHNAcorQBsQmyCfEIkgmhCaIJoC3ylgE",
    reason: 'quit', steps: 3682, total: 25, peak: 296, lights: [0],
    stats: { strikes: 0, stalls: 0, cloud: 0, reps: 0, deep: 0, trails: 2, wind: 0, thunder: 0, bait: 0, close: 0, scattered: 0, recovered: 0, thrown: 0, dodged: 0, hits: 0, glanced: 0, beast: 0, gates: 0, runes: 0, style: 260, wingovers: 5, pitch: 0 },
  },
  {
    name: "TST at the keys, sky 3", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQDAAAAAAAAAABLnwjLQdAGxQWUBqYB1AKWAeQBlgGUAYYBZGZUdkRGJDYUFhQWFEY0ZkSWAVSmAUR2NIYBNJYBNKYBJFYURhRGFEYUZhQ2FHYkxgEklgEUJhSWASS2ARQmFKYBFFYUtgEUtgEU1gLCAZYUhAGGA2SmAlTGATRmJGYkRhQ2JIYBNIYBJFYkhgE0xgE01gEklgEUZhSGAhT2C8IBphCkA-YC5AHmAbQBtgGUAaYBhAGWAWSGAVR2NFYkRiRmNNYBNMYFghXgG-YHhATlAaQDpQHEAbUBhAGlAVSlAUS1ASRVFFUUdRRlFJUBJKUTpAGlA2SlATFAUeUDdPUBVNUBRNUBNOUBJKUCFOUcxAKFAqQDdVTCGKAHQeADMYADMZACMeABMbABMaABMSDlCqQChiCEAtYClAG2AVRmRHZUlgFkJsIBVhRGJGYkRiRmJFYkdjS2ATTGATSmAijKEPYEwgPmArIPpgKkAtUCpAmyCMAPEaAFEYACEdADEZADEdADEcAEEcAGEdAFEaAFEYAFEVDCD9EW4AcygAQi0AMisAMikAMioAIyoAESEBKwASKwARIgEqABItABpgXEEpUB1AJ1xAFVdDVURXRFRCUkFRSBA9UCYdUCkQOlDsQCpQdkxQJEhQI0tQEkdRQlFFUUJRRlJGUkZSRVJGU0dTRlJCUUNSRFFBUUJRQlFCUUJSRlRJUBRIUBRJUBRKUBNGUkZRQVFGUklQEkRcEBxR2EA_UCxAHlAaQBxQGEAYUBlAJlhAJVtAFFhAFVhAF1ZOUBJFXBAfUglA71AuQC1QHkAZUBRFBxlQF0dWR1ZIUBZJUBVKUBRJUBsQvACDLwBRJwEvACIpAEIpADIoAC0RWCJPAT8Q-yGA",
    reason: 'fog', steps: 8395, total: 187.5, peak: 1055, lights: [0,  0,  0,  5,  4],
    stats: { strikes: 1, stalls: 0, cloud: 22, reps: 5, deep: 4, trails: 4, wind: 1, thunder: 0, bait: 0, close: 0, scattered: 1, recovered: 0, thrown: 4, dodged: 4, hits: 0, glanced: 0, beast: 3, gates: 0, runes: 0, style: 0, wingovers: 0, pitch: 0 },
  },
  {
    name: "TST at the keys, sky 5", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQFAAAAAAAAAAAqoAePQNAGxQWUBqYB1AKWAeQBlgGUAYYBZGZUdkRGJDYkRjRmNEYUFhQmFDYkRiRGJEYkViRWJFYkdiRmFCYUZhQ2FGYURhR2FGYUZhSGARSGARR2FKYBFHYUxgEUlgEUlgIUpgIUpgHCAYYJdPYCROYBNOYBNJYCJJYBFGYUtgEUxgEU1hy0AsYBwgG2AWSWAUR2RIYBVJYBRGYkJhQ2JFYkNhQ2JHY0pgEkVhRWFHYUtgEU5hvBB_AHQsAEIpACIvACIpACIqACEiAS4AEigAIi8AEiwAESMBKgASLQASKwASKwASKgASLAATJwhgf0BXX0AmX0AWWUAUVkRWRVZEVERURFNDUkJSQ1JCUkRTRVNGVEpQE0lQEkpQEk9RPBAeUGhALlAqQBhQKEAfUBdPUBVLUBNIUBJIUBJMUBFEUUhRuBA9UCYdUCkQPFCNQH9QSUAfUN0CixGsBCkgzABsEP4hCwBlHwBSGQAhGQARHQARGQARHQARGAARHQASHwAiGQAiGgAiGQAiHwAREwEbABEVARkAEhkAIhsAEh8AEhwAERMGS2ApQHhQGUBEWkAjXEATXEATWEASVEFSQVNBUkFTQlZDV0NVQ1dEV0RXRFVDVURVQ1REVkVVRFRDUkFRQlNDU0RURFRFU0JRQlNFU0RTRVNFU0dTSFATSlATTFAhTBAYUPgQPVAmHVApEDpQ7kA2b0B8UC1AKFApQB5RbBAbUKpAXhCKkIuAPgAiLWAmLWAoIO4ChS4AMiwAESkAESoAESoAESoAESkAESgAESkAESgAESgAESgAEScBKAARJwEpABIpACxgbEB3WUA3WUAmWkAVWUAWWkAXWUAXWEAYED1QJh1QKRA9UUdLIFsBgh4AQRsAER8AIhwAQhIMIP4Q0",
    reason: 'fog', steps: 8207, total: 105, peak: 928, lights: [0,  0,  1,  1],
    stats: { strikes: 4, stalls: 0, cloud: 0, reps: 2, deep: 2, trails: 4, wind: 0, thunder: 0, bait: 0, close: 0, scattered: 3, recovered: 1, thrown: 3, dodged: 3, hits: 0, glanced: 0, beast: 0, gates: 0, runes: 0, style: 0, wingovers: 0, pitch: 0 },
  },
  {
    name: "TST at the keys, sky 10", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQKAAAAAAAAAAA6jwrVRNAGxQWUBqYB1AKWAeQBlgGUAYYBZGZUdkRGJDYkRjRmNFY0ZjRmNGY0hgFExgFE1gE0xgE0hgIkhgEUVhSGARR2FHYUlgEUhgEU1gEUpgIU1gPCAdYMlAG2A1SGAkTmAUSGAkSGAjT2ASTWAhS2GcIBlgPkAcYChAGmAVSGAURWJCYUJiRWNEYUFhQmFCYkZkSWATRWJGYkZiSWASS2ARSWART2FIEH8AlC0AQy8AIisAEi8AEioAEisAFEhQS0BvYBlALGAbQBxgGEAbYBZLYBVIYBNFY0ZiQmFDYkRiQ2FBYUNiRGNGY0RiQmFDY0ZjRGJDYUFhQmFCYUFhQ2JEYkNiRGJDYkRiRGNGY0VjRmRIYBRIYBRHY0ZiRGFBYUViRmJIYBJJYBJCbCAYYVggPWAmLWApID1g2EC6YE9AHGA0SGD4ID1gJi1gKSA4YDwgigTuUC9BLWAvQCVhLwAtQCYIQCVZEDtQGEAqYjtAK2ArQBlgF0ZnRmZJEQiQ-YAeADxQa0A5YDpAKWApQBhgNExgMk1gIkpgI09gE0tgEkZiS2ATTWATSWASRWJHYkRhQWFFYkViRWJEYkVjR2NGY0ZiQ2JGYkNhQmFEYkZiRmJEYiIIIB1gcklhuUAoYDpAHmAWSGAUR2RGY0VjRmRIYBRIYBNGY0pgE0tgEkJsIB1h70B7YC9AKmAaQBogLaDLgLsAQx8AMh4AIhgAMh0AIh0AIhsAIhoAIhkAIhgAIhgAIh4AEhkAIhcMUG5AZmZPUPhgPBA5UCkSHgDCTlApQS4AGiAdYCYtYCkgOWFZQC9QL0BcYC5AHmAYQB5gFUxgIkxgMUtglEwgH2BsoRlgnCHuA2",
    reason: 'fog', steps: 8789, total: 145, peak: 1295, lights: [0,  0,  1,  0,  5,  4],
    stats: { strikes: 4, stalls: 0, cloud: 6, reps: 4, deep: 4, trails: 5, wind: 0, thunder: 0, bait: 0, close: 1, scattered: 3, recovered: 1, thrown: 4, dodged: 3, hits: 0, glanced: 0, beast: 3, gates: 0, runes: 0, style: 0, wingovers: 0, pitch: 0 },
  },
  {
    name: "TST at the keys, sky 21", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQVAAAAAAAAAABq7grZRfECogNAFKUFpAfGAeQCtgHUAaYBhAGGAWSGAVR2RGY0ZjRmNGY0hgFEpgFExgFE1gE0tgE09gEkZhRWFGYk5gE0lgI09gEkhgEUVhSGARR2FJYBFEbCAcYbZKYDVLYCVJYCVPYBRLYBROYBROYBNOYBNKYDJMYFwgHWFdQC5gLEAdYBlAGmAYQBlgF0dmR2VGZUdlR2NDYkVjRmJEYkZuABgQLADUGABCGgARFwEYABEYABEYABEXARkAER1QaUBnb0AlbEAUaEAUaEAUZkRnRWZEZURkRGVFZUZlRWRFY0RjRmRJYBRKYBJFYkxgEkpgIU5g3CAYYMtAK2A6QBlgJkpgFElgE0ZiRWFCYUNhRGFEYURhRmFGYUpgEU9hjCAdYE1APmAeQCdtQBRoQBNnQ2VCZEJjQWFBY0NmRWdGZ0ZlRWVHZkRrIQqgKIDrADEeABEfADEdACEfACEbACEaACEYACEYACEeABEeABEcABEbABEbABEaABEYABEZABEYABEYABEWARMPUHxAPGApQDhgK0AcYCZOYCNOYCggPWAmLWApIDthDUDJYDxAL2AaQBxgFkxgFU5gMUpgWRB6UCoQ_wDBKgAhLQBBLAAxLgAxKgBRKgBhKQBRKQAxKAAxLQAhLAAhLAAhKwAhIQZMUClALYC_oClgzEBIYIRJYUhAKWA6QB5gF0pgFklgEkMJIB5gFk1gFU5gFElgIktgEU9h2EA_YCxAF2mgEoqhjWAuIU0C_BD9IXgBjVA4QLtgG0AeUPJtUBwQOFAqEYgASlAvQS1gLUAtYB5AGmAZQBdnR2ZGZUVkRWRFZEZkRmRHY0RiRmNIYBNLYBNMYCJPYFwgHGFeQExgGiFcAGUbAGIZACEYABEeABEZABEbABEVARcCHQASGAASHAASGQASGgASGgASGAASGgASFwIaABIXAhkAEhcCGAASFwIYABIXAhgAEhcA",
    reason: 'fog', steps: 8921, total: 265, peak: 1390, lights: [0,  0,  0,  5,  0,  4],
    stats: { strikes: 1, stalls: 0, cloud: 7, reps: 5, deep: 5, trails: 5, wind: 2, thunder: 0, bait: 0, close: 1, scattered: 2, recovered: 0, thrown: 5, dodged: 4, hits: 0, glanced: 0, beast: 3, gates: 0, runes: 0, style: 0, wingovers: 0, pitch: 0 },
  },
  {
    name: "TST at the keys, sky 33", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQhAAAAAAAAAABQhArTRNAGxQWUBqYB1AKWAeQBlgGUAYYBZGZUdkRGJDYkRjRmNFY0ZiQmFCYUJhQ2JFY0hgE0hgEkRiSWASRmJKYBJJYBJLYBJLYBJNYBJMYBFDYU1gEUhgEUpgMUpgLCAYYQpAGGA2TmAUSGATSGATR2JEYkZjSmAUTWATSWASSWAST2ASSGFMIB9grEA-YC5AHGAYQBhgF0hgF0hgFUZlSWAWTWAVTmASSmARSmC_IDgAwRoAcRsAYR0AQRwAMR4AIR0AGFCOQChgTEAqYDZLYDNKYCJLYBFCYUhgEkdiR2JFYkdiRWJHYkZiRWJHY0lgFEpgFEhgFEhgFEhgFEZjRWJCYUJhQmFBYURjR2RKYBRKYBNGYyIHLGIMQChgPEAfYBlAG2AXSmAWSWAVSGAUSGAUSmAUTGATS2ASR2wgHmEvoR1gOCAvEHkAcygAYS8AESoAMSsAIS8AISwAISwAIS0AISsAISsAISsAISoAISsAISkAISoAISgAISoAISgAISgAISgAISgAIS4AESgAIS4AES8AES4AESwAESYBLgARKwARLAARLgARKwARKAAhLAARKgAiLABCKwAyKgAyKQAxJQEpACEkD2BZQBmAbZCPUIhAS1FfIJ0AhBoAQx0AIhsAEhwAHFCIQD1gP0AoYFRPYNVPYDVJYCVNYBRHY0ZjRWJDYkVjR2JDDSAtYCYtYCkgOWEKQDlgZ01gJEhgI05gM0ViQmFCYkNjRGNCYkNkQ2REZ0VoQBNjQWJCZkNnQ2dDaEAUakAUZ0RnRGZEZEJhJAcjY0RjRGNDY0VkQmggPWAmLWApID9hHUAfYC8SCgX8YEhAqVAeQCdcQBVXRFZDVENUQlJBUUFSQlNCUkJTQlJIED1QJh1QKRA7ULhAP1D0T1BES1AkTVAUTVAUTFATSFASRlJIUBJGUUNRQ1FGUklQEkhQEkpQEkpQEkRcEB9Qa5FcUC-QHBF5AF0QbwBzKABCLAAyLAAxJgEqACEqABEuABEsABErABEtABEqABEtABIqADIrACIsACIrACIqACIpACIvABMrABMnASEBJgIpABIoABIpABIpAB",
    reason: 'fog', steps: 8787, total: 200, peak: 1284, lights: [0,  0,  0,  1,  5,  0],
    stats: { strikes: 3, stalls: 0, cloud: 5, reps: 3, deep: 3, trails: 5, wind: 2, thunder: 0, bait: 0, close: 0, scattered: 3, recovered: 2, thrown: 3, dodged: 3, hits: 0, glanced: 0, beast: 3, gates: 0, runes: 0, style: 0, wingovers: 0, pitch: 0 },
  },
  {
    name: "TST at the keys, sky 35", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQjAAAAAAAAAAB9xwvXRtEBkAKiAdABFKUElArmAaQCtgGUAXZUZlR2VIYBRFYkNiRWNGYkNiRmNHYkRiRmJGYkdjTWATS2ASSGARQ2FHYk5gE0xgIkpgEk1gIktgMklgHCAfYQdJYDROYBNMYBNLYBNLYBNMYBNMYBJHYkxgEktgEURhTWARS2ART2EMIB5gy0AqYDtAG2ApQBlgJ09gFU1gE0xgEk1gIU1gvhCoAKpgaEBKUC9AL1AdQB5QGUAdUBZJUBRHU0VTR1NFUkRTR1NFU0dTRFFBUURTSFAUSFATRlNHU0dTR1NHU0dTSFATR1JEUUJRRFJIUBNMUBNPUBNLUBwQG1GaQBlQN0pQJUtQE0dSRVJFVENTQ1RDU0JTQlJCVERVQ1JBUUFRQlNDU0RSQlJEUkVRQVFLUBFPUGwQG1F6QFgQmZEYEJ4AdCsAUi8AEi0AIikAGGCJQD5QKEA_UBhAHFAUSlATS1ATTFAiTlAST1ASS1ASTlARQ1FMUBFGUUhQEUZRRlFEUUZSSVASRlJGUkVSRVJEUUFRRFNIUBRJUBRIUBNGU0hQEkJRRFIKEB9QNUhQQUJRSFHoQF0gnQBXHgBUHQAzGgAjHAAiFwEVARYBFQEVARYBFAETCiBMYLJbEi8AZS4AS2BsQGZYQDVfQBVdQBJcEBwAHUAmBk9QGRA9UHtALlG-QB9QKkAYUCdLUBZLUBZKUBVKUBVLUBRJUBFCChAfUGuRS1AokEgR7wCiKgBhLwAhLgAxKgAxKwAxKQAxKgAxLQASKgAyKAAyKgAyKQAyKQAyKwAyLgAyLgBBKQAhLQAxLgAhKAAxLgAhLgAhLgAhLAApEIhSGkA6YBhAi1AvQC1QHUAbUBhAGFASRAgQGlAmTVATR1JHUklQEkhQIU5RnUA4UC9AKVAeQCdaQCZbQBVXRFZFUUUHF1VGVEVTRVNEUkRSQ1FBUURTSVAUS1ATSlASSVASSFAxSFBPkQlQOxFqUBlALWA5QBoDjBD5AO",
    reason: 'fog', steps: 9047, total: 312.5, peak: 1479, lights: [0,  0,  0,  0,  1,  4],
    stats: { strikes: 1, stalls: 0, cloud: 4, reps: 6, deep: 5, trails: 5, wind: 0, thunder: 1, bait: 0, close: 2, scattered: 0, recovered: 0, thrown: 6, dodged: 4, hits: 0, glanced: 0, beast: 3, gates: 1, runes: 4, style: 0, wingovers: 0, pitch: 0 },
  },
  {
    name: "collector at the keys, sky 4", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQEAAAAAAAAAABDhgeWQNAGxQWUBqYB1AKWAeQBlgGUAYYBZGZUdkRGJDYkRjRmNFY0ZjRmNGYkNhQmFDYkdiRGFDYURiSmASR2JMYBNMYCNLYCNIYDNIYFFOYBwgG2DHSmA0SGAjTmASR2FEYUVhRmFEYUhgEklgIk5gMU9hjCAeYBZPYBVOYBVNYBVNYBVMYBNFYUJhRGJJYBNNYBNLYCJLYWihPpCMgB2QKIBroB6AlquArZAfgI9QbEAoYEpAO2BMQCxgGUAnbEAUaUATaUASZUFkQmtAEmdCakASZkJpQBJkQWNBYkFkQmVCZENnRGZEZkRlRGVEZENjQ2NEZUdmSWAVQQsgHWAlS2AkSmAzTWFqQBlgN01gFUlgFEZjRWJDYkRjR2VKYBVFaKCOlB2Am5ApoV6AUqmQrIBuYJxAHFB7kYug_pLJgRSpgDOtgCOqgCOpgCOugBOsgBKlgaKBpoKng6qAE6aDp4SogBaogBigFouhOpBpgEqQQ4ygKIFTq4AjqYAjp42Q-qDOIM5gH0AYUEtAbmAdQCtgGkAaYBZKYBRHYkRhQmFFYkpgEkpgE0thKCA9YCYtYCkgPmBqQDtQHkCMYCtALmAaQB1gFkpgFEtgE01gEklgIktg66CVZkNir5ELEBgAFS1gJi1gKSAyrGGpQBhRZUtQfBAYUMhAKFA4QB5QFkxQFUlQE0VTSFAUSlAXRVNCUUJRQlJGU0xRnBAdUL5AKGAooH",
    reason: 'fog', steps: 8214, total: 167.5, peak: 902, lights: [0,  0,  5,  0],
    stats: { strikes: 2, stalls: 0, cloud: 4, reps: 3, deep: 2, trails: 5, wind: 3, thunder: 0, bait: 0, close: 0, scattered: 10, recovered: 3, thrown: 4, dodged: 3, hits: 1, glanced: 0, beast: 0, gates: 0, runes: 0, style: 0, wingovers: 0, pitch: 0 },
  },
  {
    name: "collector at the keys, sky 12", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQMAAAAAAAAAACGAvIIjEPQBsUFlAamAdQClgHkAZYBlAGGAWRmVHZERiQ2JEY0ZjRWNHZEhgE0ViRWJFYkdiRWFDYUViS2ASSGARRGFGYUZhRWFHYUVhRmFGYUVhR2JOYBJKYBFDYUtgEkhgIkRsIB1ghE5h2kAYYDZOYBRKYBNHY0pgE0hgEkVhQmFFYUJhRmJLYBJHZSEGL2HIQC5gKkAcYBdIYBVFY0NjRWVGZUZhSqCqgEmQ3qBcgOecgVhgi0AoUEhASVAtQBxQGkAaUBdHVUZURFRGVUZVR1VIUBVKUBVNUBVIUCRLUCNBXCCsACkgG2IySFFtEDhQKxDLQB9gOEEhW2A4IFyi34A_kK2AHpCegHsAGWCKQClQXEAqUFVJUENKUCNNUBNOUBNPUBNNUBNLUBJEUklQFExQFEhQFElQFEdTRlRJUBRJUBRJUBNIUBJFUgoQHlItQC9QK0AdUBhAHFAXSlAVSFAUSFAUSVAUTFATR1RGVEwQH1F_EQMPYE9BHVAdQCpQH0AZUBxAGFAaQBlQGUAaUBhAGVAVRlNFUkJRQ1JGU0hQEkRRQ1FFUk1QEUNRTlBsEB1Q3ZEIUL1AHmBLQEhQS0AYUM2QnlAfkfyAq6AfgCqgEYuhC4BMkCuAL5AagBiQJAwgGWBYoBiASJCrUL1AiVBNQBtQJk5QIUtRlEwAFExQP0AdUBpAGlAZQBdVRFREU0NURVREU0NfkFmAS6CKgQSdgHKegHQaABIoYV0gOGAsId",
    reason: 'fog', steps: 8588, total: 655, peak: 1138, lights: [0,  0,  4,  0,  0],
    stats: { strikes: 0, stalls: 0, cloud: 17, reps: 4, deep: 4, trails: 4, wind: 3, thunder: 0, bait: 0, close: 0, scattered: 0, recovered: 0, thrown: 4, dodged: 4, hits: 0, glanced: 0, beast: 3, gates: 1, runes: 1, style: 0, wingovers: 0, pitch: 0 },
  },
  {
    name: "holding its line at the keys, sky 7", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQHAAAAAAAAAAB-ugvPRtAGxQWUBqYB1AKWAeQBlgGUAYYBZGZUdkRGJDYkRjRmNFY0ZiQmFDYkVjSGATR2JFYkhgEkZhRGFEYUZiTmATS2AiSGASTmASSWASTWASTGASTWASTmASRGwgHWB1SWBSS2GsQB9gKEAZYCZMYBVLYBRIYBNIYBRNYBRDbCAdYg5ALWAvQB5gHEAZYBhAFmVCayCMAHUfAFIdABEXAR0AEh0AIhgAIhgAIh8AEh8AEh4AEh8AERVOYCtA6VAtQCtQHEAZUBpAGFAYQBZWRlVEU0NTQ1JCUkNTRFNEU0RTRFNFU0RTRlNFU0dUSlAUS1ASQ1FGUk1QEUNRTFBcEB5RTEAvUBgQPVAmHVApEDtQyUBbUh9AKGAvQBwAHUA3akAdIX8AWBAaAEgQHVAmHVApEDhQPEAdYYlAH2AlTmAVTmAVSmAUR2NFYkNiRGNGY0RjRmRHZEdjRGJEYkVjSGAUTGAUTWASQQsgHWHoQC9gKkAeYBdJYBVHZERiQ2JDY0ZkRWNHKAAhHVAmHVAsEb4AkSgAES0AQSgAMSsAMSkAMSgAMSgAMS4AIS4AIS0AIS0AISsAISsAISsAISkAISoAISgAPUAmDVAqEK0AaSAbAEQtACMtACMuACIrABElASoAEikAIy8AIyYLYG5AdlxAJFlAElNBUkFTQVJCVkNWQ1VDVURXRVZEVENTQ1RFVUVURVRGVEZTRVJFU0pQE0tQEkpQEk9QMU5QrBAYUMlALVA4QB9QFUxQFEpQE0lQE0xQEkhQEk1QIktRnBAdUBdKUCpAGlAaQBdbQBVZQBRaQBNXQlZCV0JXQVFBVUJYQBNYQBJSQVNBUUFTQVFBUkFSQlREVkVUQ1JBUUJRQVJEU0RTRlNGU0lQEkZRRVFOUUwQElgQ2AEhKQBRLgBRKgBRLgBBLQBBKwBBKABBLQAxKQAxJAVOUChBPGArQCxgG0AZYBhAF2REY0VkRmNFYkNiRWJFY0tgFElgI09gIkhgrCAfYJggPWAmLWApIDhgz0B-YEtAH2AkS2FYQB1gJk1gFkFsIB1gFkpgFklgFklgFUdkRmNFY0VjQ2VCZEJiQmNDbSCbAFcfAEMaACIdABIfABIeABIcABIeABIcABESARoAEh4AEhwAEh8AEh8AEhsAIh0AIh4AIR",
    reason: 'fog', steps: 9039, total: 315, peak: 1466, lights: [0,  0,  1,  5,  0,  1],
    stats: { strikes: 5, stalls: 0, cloud: 2, reps: 6, deep: 6, trails: 5, wind: 0, thunder: 0, bait: 0, close: 0, scattered: 5, recovered: 1, thrown: 4, dodged: 1, hits: 3, glanced: 0, beast: 3, gates: 0, runes: 0, style: 0, wingovers: 0, pitch: 0 },
  },
  {
    name: "holding its line and taking Algiz at the keys, sky 1", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQBAAAAAAAAAAA6iQjfQdAGxQWUBqYB1AKWAeQBlgGUAYYBZGZUdkRGJDYkRjRmNFY0ZjRmNGY0djSGASRGJIYBJHYklgEklgEUNhSGASSGAiTWASTGAiSGBBTmA8IB1gykAfYCdLYCVLYBRLYBNGYkdjTGATTWATSmG8IB1gSEA7YC1AHGAZQBhgFkVjQmJDY0RkRmZJYBZIYBRHY0ZiRWFCYUdiSmErIQ4EMy8AMi0AIikAEiwAEi8AEi4AEigAIigAIioAIiwAISUBKgAiKABCKwAyKAAxJgEpACIrAC9gX0B1WEA0XUATV0JWQ1lAE1ZCVEJUQlRCVUNVQlNCVEJTQlNBUUFSQVFBUkFSQlNCU0NVRFRDVEVWRlRDUkNTRVRHVUpQFEhQE0pQE0hQIktQHSDoYXkgHwAWT2AWLWApIBQMEB9RmkA7YBpBbFAaQDFRGQEKEgoCcSoAMSgAEk5QPRAbABlAJGYtYCkgP2FvQL1gPUAuYBtAGWAXR2ZGZkdnSGAXR2ZGZUZmQmUjBClgFEZiQmFCYUJhQmFDYkZiRGFDYUNhRGFEYUZhRmFMYBFNYc5AamAfQDVrQCRtQBEFJgNGaUAUZUJiQWFBY0NlQ2RDY0JjQ2RDY0NkRGREZEVlRmRGZUpgFUtgFE9gE09gyCA9YCYtYCkgOmDNIYkAZhsAQxoAIxwAIhcBFAEXAhwAEhcCGgASGAASGQASFExgOUCOUBhAKVAaQBhQGEAZUBNNABsQHVAmHVApED1Qm0BuUD1AHlAnTVAjTVGOQB9QI0YGHVA5QBhQJk9QFU9QEUsQfgBPIC0AGyAzX2GfQChQKUBdEcsAsioAcSgAMS8AMSsAMS8AIS4AIS4AISwAIS4AISkAMSoAMSgAMS4AIS8AIS0AIS0AISIA",
    reason: 'fog', steps: 8415, total: 145, peak: 1033, lights: [0,  0,  5,  1,  0],
    stats: { strikes: 4, stalls: 0, cloud: 4, reps: 3, deep: 3, trails: 4, wind: 0, thunder: 1, bait: 0, close: 0, scattered: 4, recovered: 1, thrown: 3, dodged: 1, hits: 1, glanced: 1, beast: 3, gates: 2, runes: 2, style: 0, wingovers: 0, pitch: 0 },
  },
  {
    name: "TST pulling its ears out of lift at the keys, sky 8", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQIAAAAAAAAAABpiAmwQ9AGxQWUBqYB1AKWAeQBlgGUAYYBZGZUdkRGJDYUFhQmJFY0ViQ2JFY0ZiQ2JGY0diRGJIYBNLYBNMYBJGYkxgEkdhRGFGYk1gE0hgI0hgIkxgEkhgMkRsIBthaEAaYDVMYBNIYBNJYBNHYkViRWJFYUFhRGJHY0hgE0lgE0lgE0xgE01gEk1gEk5gnCAbYTpAPWAvQB5gHEAbYBpAGGAXR2ZGZUVjQ2JCYUFhQmJEY0ZkSGATSGATS2AYIM0Agh0AIR8AERkAIR4AER4AER0AERwAERsAERsAERoAERoAERgAERkAERgAEhsAIxsAIxgAIhIESGBNQGEPEC1QJh1QKRA7UF8R7AAqYGlAdl9AJV5AFVxAFVlAFVpAFllAFVZEVEJSQVFBUUFSQlNDVERVRVVFU0JRQlNGVUlQFEdTR1JFUklQEkhQEUZRTVARTVCcEBlQ6RHLAEsgGgBGLAAlLgAUKgAUKgAUKAAUKQAUJwIkTlArQF5gL0AsYBhAKGAdQBZrQBVrQBRnQ2dEaUAUZkNmRGdEZkRlQ2RDZENkRGVEZUVlRGREY0JiQ2RFZERhSAAYIC1gJi1gKSA6YQ1ALGBnTWAlT2AUSmATRmNIYBRHZEZjQ2JDYkNjQ2JDY0FqILwAkh8AYRkAMRkAQR0AMR4AMRwAMRsAMRgAMR0AIRkAMd_AIdnAIdjAIdvAIdjAIdrAIdjAIdjAIdjAId3AEwEfABEbACEaACEdACwg_xC60RrAWgEULwAqYG9AZl9AJV9AFVtAFVtAFltAFlhAFVdFVkRUQ1NDVERURFRFVERSQlJEUkJSRVNGU0dTR1JGUkhQEktQEklQIk1QjBAaUH-RD1D_QBtgP0BvUBtALFAbQB1QFkpQE0dSSFASTlASSVDsEBhQnUArUCxAGlAYQBRcEekBkSoAMSsAMSkAJ8HrwCHrwBHqwBIBKgARKwARKAARIgNOUDpg61AbYVlAfmBoQB5gLCAcYT9AGWA5QB5gFklgFUpgFktgFUhgE0ViRGJGY0lgE0lgEkdhQ2FKYBFPYNwgE2wgeWApIIsB4",
    reason: 'fog', steps: 8624, total: 262.5, peak: 1160, lights: [0,  1,  1,  0,  0],
    stats: { strikes: 2, stalls: 0, cloud: 0, reps: 3, deep: 2, trails: 5, wind: 0, thunder: 0, bait: 0, close: 0, scattered: 0, recovered: 0, thrown: 3, dodged: 3, hits: 0, glanced: 0, beast: 0, gates: 0, runes: 0, style: 0, wingovers: 0, pitch: 0 },
  },
  {
    name: "TST never catching its wing at the keys, sky 2", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQCAAAAAAAAAABGoQfcP9AG8QmAApIXgAHCByDCNPAB0gNwsgJQogJAogIwsgIg0i7wBLIY4AZR0AUxsAMxoAMxwAIhoAEh0AEhoAEhsAEhkAEhYOIHoALREKABwQNwkQJQ4QFA4QFAwQJA4QIwoQIg4QEg4QMQ0SqgBKEDgAKhAjDRFOAJIuADErABEoACErABErABEqABEpABEpABEoABEoABEnAScBJwEnAi8AEigAESQBJQElASQBJQEkASQBJAEjASUBIgElASIBJQInAiYCJgMqABMmAykAFCgAEyYDJgMmBCkAFSkAFSMLIN0ALxB9ABsQzZDvEoIKIEwEYi8AMSYIEOwhiwBVGSB6ADsQbQAuEDkAHxAmChAlCBAlDxAUChAjDRK7kO0TCQAZEDcKECUKEBMGEgUSBhMJEBMIEBIFEQghmwBlGwBSGAAiGAAyGQAiHAAiGAAhFAEbABEWARoAEhoAIh0AEh8AEh0AEh0AEh4AEhsAEh4AEhwAEh0AEh0AEhwAEh4AEh0AERIBGgARFAEYABEUARgAEh4AEx0AGiB_ACgQnwAfEEgAGxA3ChAlDBATCxASChARAxEOEBIOEEEKE0wAKxGJAGUkA",
    reason: 'fog', steps: 8156, total: 175, peak: 929, lights: [0,  0,  0,  5],
    stats: { strikes: 1, stalls: 0, cloud: 4, reps: 3, deep: 3, trails: 5, wind: 2, thunder: 0, bait: 0, close: 3, scattered: 2, recovered: 1, thrown: 3, dodged: 0, hits: 0, glanced: 0, beast: 0, gates: 0, runes: 0, style: 0, wingovers: 0, pitch: 0 },
  },
  {
    name: "TST flying wingovers at the keys, sky 6", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQGAAAAAAAAAABEyweLQdAGxQWUBqYB1AKWAeQBlgGUAYYBZGZUdkRGJDYkRjRmNEYkVjRmNGY0djSGATSmATS2ATSGAjSmAiTWASSmAiSGAiTGAiSGAxRWFIYBwgGWB2SmAkT2ATTGASSGAST2ASTmARSmARTmHeQC9gKEAUCCAcYCtAHmAYQBxgFkpgFEdjSWATSmASSWASTWBNIWkQHVAqEF4gixB7IJ0RiSCfEIwAnyCvAyEdALEdAKEaAfxQT0BfIWsAgxoAURcBGAAyGwBBFwEcACEbABEZACEbABEfABEcABEdABEdABEaABEeABEZABEdABEaABEaABEbABEZABEaABEZABEaABIeACIeABIaACIdABIYACIcABIeABIcABIcABIaABIcABIZABESARkAEhwAEhcOUGxAdm5AJW9AFWtAFWtAFWlAFWhAFWdEZEJhQWNDY0NkQ2JCYkNjRGNFY0ZjS2ASSGB5ITgChS8AIy0AEikAEikAESEBKAASKAARIgEmAisAEiMESFA6QK5gGUAqYBtAGGAYQBdnRmZGZkZmRmdHZkVlRWVFZENiQWFCYkJiQmJDY0NiQWFCYkNjRGRFZEVkRWRDaCA9YCYtYCkgPmIIQLdqQDRvQBRsQBRqQBRoQBNmQ2VDJQQjZkVmRWdGaEAXZ0ZlRGNDYkFhQmFBYkRjRGNFY0ZjRmJFYUFhR2JPYBJOYMug7mAfoB8grgGhGwBhGQBhGABhGwBRHQBBHQAvUF5AZ2pANmhAJWpAFWtAFmtAFmlAFWdFZ0VnRmhAF2hAGGAXR2RDYUFhQWFCYUFhQmFBYUJhQWFDYkRjR2NGYkRiR2JGYklgEkxgEUVhTWBcIB5g7aEJYQpAOFAeQFhgXEAcYDRLYDJJYCFFYUpgEUNhSWASSGASR2JGYkZiRWJFYUFhRGJFYkVjR2NGYkIKIB9gF0tgFklgFklgFUdjRGJDbyDdAHQZAFIaACIeACIZACIaAC",
    reason: 'fog', steps: 8331, total: 170, peak: 971, lights: [0,  1,  0,  0],
    stats: { strikes: 1, stalls: 0, cloud: 0, reps: 2, deep: 2, trails: 5, wind: 0, thunder: 0, bait: 0, close: 0, scattered: 0, recovered: 0, thrown: 2, dodged: 2, hits: 0, glanced: 0, beast: 0, gates: 0, runes: 0, style: 95, wingovers: 5, pitch: 0 },
  },
  {
    name: "TST pitching its wing at the keys, sky 9", engine: "node, replayed in chromium 143.0.7499.4",
    link: "AQQJAAAAAAAAAABq3ArbRdAGxQWUBqYB1AKWAeQBlgGUAYYBZGZUdkRGJDYkRjRmNFY0ZjRmNHY0ZiRGFDYkhgEkZiSmATSWAjSmAjTWAjS2AjT2AjS2AyRmwgGWCGT2A0TmBSTGGqQBlgNk9gFEpgE0lgE0hgEkELIB9gRU1g_SB8YLkgSwA5EB0AHECrAKxApwogPQA3LgCNEHpQKxDqUQtAPFA8QB9QF0pQFUdURlJBUURTRlNFUkNSRVNHU0ZTR1NHUkNRQ1JHUkRRQlFFUkdSSFARQVFIUBJPUBJMUGwQH1DMkRalKmApIE0AKBApALQdAEMYADIfABIZACIfABIeABIeABIdABIdABIcABIYAB1Qa0B3aEA2bUAVaUAUZ0RmRGdGaEAVZENkRGREY0JiQ2JCYkNiRGNFY0hgFE5gFEhgQUhg7CAfYLxAKGA4QBlgGEAYYBhAFmZEZERlRGNCYUFiQ2NFZEZjRmNLYBNKYNwhfgAvgP8CHWBZQMhQHEAmWkAVWEAVV0VWRVVDUkJSQlNEVEVURVRGVEhQFEhQE0lQE01QE0lQMk1QzBAdUM1AKlA7QB9QFklQFUpQFUpQFElQFEJZkZtQKxHESGBbQHhQH0AhWxC9UCYdUCkRHQBKIBsARSgAIycCJgEhASQBIwInAygAFCoAE0pQPEBPYD5AGWAqQBxgGEAZYBhAGGAYQBZnRWdFaUAVakAVbEAUa0ATakATbkATbEASZkJqQBNpQBNoQBRqQBVpQBVoQBRlRGdGaEAXZ0ZiRAggGWAVR2RFYqKKoQthWEA8UBpAi2ArQCtgHEAaYBpAGmAYQBhgF0lgGEAaYBhAGmAZQBpgF0NkJAQsYBZKYBVIYBNGYkRhQmFEYUNhRGFFYUZhTGARSmDOEQ8CXCD4EbkBK2BfQGhQHUA3U09g9lxgHCA5YC0gg",
    reason: 'fog', steps: 8923, total: 265, peak: 1372, lights: [0,  0,  0,  0,  1,  4],
    stats: { strikes: 1, stalls: 0, cloud: 8, reps: 4, deep: 4, trails: 5, wind: 1, thunder: 0, bait: 0, close: 0, scattered: 1, recovered: 0, thrown: 6, dodged: 6, hits: 0, glanced: 0, beast: 3, gates: 0, runes: 0, style: 125, wingovers: 0, pitch: 51 },
  },
]);

test('runs flown in a browser replay in Node to the very sheet the browser showed', () => {
  assert.equal(GOLDEN.length, 19);
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
