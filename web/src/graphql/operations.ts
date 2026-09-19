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

export const GET_ONCHAIN_OBLIGATION = gql`
  query GetOnChainObligation($pubkey: String) {
    obligation(pubkey: $pubkey) {
      pubkey
      owner
      lendingMarket
      source
      deposits {
        reservePubkey
        asset
        depositedAmount
        liquidationThreshold
      }
      borrows {
        reservePubkey
        asset
        borrowedAmount
      }
    }
  }
`;

export const GET_SNAPSHOTS = gql`
  query GetSnapshots($since: DateTime, $limit: Int) {
    snapshots(since: $since, limit: $limit) {
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

export const GET_EXECUTIONS = gql`
  query GetExecutions($limit: Int) {
    executions(limit: $limit) {
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
      bookSnapshot {
        bids {
          price
          size
        }
        asks {
          price
          size
        }
      }
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
        damageOffsetPct
        badDebtReductionPct
        liquidationsPrevented
        onChainLiquidationsAbsorbed
        hedgeCost
      }
    }
  }
`;

export const SET_KILL_SWITCH = gql`
  mutation SetKillSwitch($active: Boolean!) {
    setKillSwitch(active: $active) {
      connected
      tradingPermission
      withdrawPermission
      accountAddress
      marginAvailable
      killSwitchActive
    }
  }
`;

export const UPDATE_POLICY = gql`
  mutation UpdatePolicy($input: RiskPolicyInput!) {
    updatePolicy(input: $input) {
      warning {
        minimumDistance
        hedgeRatio
      }
      danger {
        minimumDistance
        hedgeRatio
      }
      critical {
        minimumDistance
        hedgeRatio
      }
    }
  }
`;

export const SET_SIMULATED_PRICE = gql`
  mutation SetSimulatedPrice($price: Decimal!) {
    setSimulatedPrice(price: $price) {
      id
      timestamp
      price
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

export const SIMULATE_PRICE_SHOCK = gql`
  mutation SimulatePriceShock($dropPercentage: Decimal!) {
    simulatePriceShock(dropPercentage: $dropPercentage) {
      id
      timestamp
      price
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

export const RESET_SIMULATED_PRICE = gql`
  mutation ResetSimulatedPrice {
    resetSimulatedPrice {
      id
      timestamp
      price
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

export const TRIGGER_SAFETY_REFUSAL = gql`
  mutation TriggerSafetyRefusal($checkType: String) {
    triggerSafetyRefusal(checkType: $checkType) {
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
      bookSnapshot {
        bids {
          price
          size
        }
        asks {
          price
          size
        }
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
      bookSnapshot {
        bids {
          price
          size
        }
        asks {
          price
          size
        }
      }
    }
  }
`;

export const SET_OBLIGATION_PARAMETERS = gql`
  mutation SetObligationParameters($input: ObligationParametersInput!) {
    setObligationParameters(input: $input) {
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

