import { gql } from '@apollo/client';

export const GET_CURRENT_SNAPSHOT = gql`
  query GetCurrentSnapshot {
    currentSnapshot {
      id
      timestamp
      price
      collateralValue
      riskAdjustedCollateral
      debtValue
      healthFactor
      liquidationPrice
      liquidationDistance
      riskLevel
      emergency
      exposure
      hedgeRatio
      targetHedge
    }
  }
`;

export const GET_EXECUTION_STATUS = gql`
  query GetExecutionStatus {
    executionStatus {
      connected
      tradingPermission
      withdrawPermission
      accountAddress
      marginAvailable
      killSwitchActive
    }
  }
`;

export const GET_SCENARIOS = gql`
  query GetScenarios {
    scenarios {
      id
      name
      description
      sourceNote
    }
  }
`;

export const RUN_REPLAY = gql`
  query RunReplay($scenarioId: ID!) {
    replay(scenarioId: $scenarioId) {
      scenario
      sourceNote
      ticks {
        timestamp
        price
        snapshot {
          price
          healthFactor
          liquidationPrice
          liquidationDistance
          riskLevel
          targetHedge
        }
        execution {
          id
          status
          filledNotional
          slippageBps
        }
        hedgePosition
        hedgePnl
        cumulativeFunding
      }
      withoutHedge {
        liquidationPenalties
        badDebt
        hedgePnl
        fundingCost
        slippageCost
        netLoss
      }
      withHedge {
        liquidationPenalties
        badDebt
        hedgePnl
        fundingCost
        slippageCost
        netLoss
      }
      impact {
        lossAvoided
        badDebtReductionPct
        liquidationsPrevented
        hedgeCost
      }
    }
  }
`;

export const SNAPSHOT_STREAM = gql`
  subscription OnSnapshotStream {
    snapshotStream {
      id
      timestamp
      price
      collateralValue
      riskAdjustedCollateral
      debtValue
      healthFactor
      liquidationPrice
      liquidationDistance
      riskLevel
      emergency
      exposure
      hedgeRatio
      targetHedge
    }
  }
`;

export const EXECUTION_STREAM = gql`
  subscription OnExecutionStream {
    executionStream {
      id
      timestamp
      riskLevel
      liquidationDistance
      targetNotional
      filledNotional
      avgFillPrice
      referencePrice
      slippageBps
      residualExposure
      status
      note
    }
  }
`;
