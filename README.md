# Anonymous Voting System with zk-SNARKS

A blockchain-based voting system using zero-knowledge proofs for secure, private voting.

## How It Works

1. **Registration**: Voters are registered in a Merkle tree
2. **Ticket Generation**: Each voter receives a ZK-proof ticket
3. **Voting**: Votes are cast anonymously with cryptographic verification
4. **Verification**: Smart contracts verify proofs and record votes

## Quick Start

### Install

```bash
git clone https://github.com/yourusername/zk-voting.git
cd zk-voting
npm i
```

### Prerequisites

- Node.js v14+
- Rust (for circom)
- Circom & SnarkJS

### Usage

```bash
1. npm run clean          # Clean build files if needed
2. npm i
3. npm run start-poll     # Initialize a new poll
4. npm run get-ticket     # Get your voting ticket
5. npm run vote           # Cast your vote
6. npm run verify         # Verify a proof manually
```
You need to choose address and input manually into the account address to get ticket
If you want to simulate multiple voting processes, you can repeat steps 2-6 and enter different addresses.

## Project Structure

```
├── circuits/          # Circom circuits
├── contracts/         # Solidity contracts (Verifier.sol, DAOVoting.sol)
└── scripts/           # JS utilities
    ├── merkleUtils.js # Merkle tree operations
    ├── proofUtils.js  # ZK proof generation/verification
    ├── votingSystem.js# Core voting logic
    └── cli.js         # Command-line interface
```

## Key Features

- **Private Voting**: Zero-knowledge proofs ensure voter anonymity
- **Double-Vote Prevention**: Each ticket can only be used once
- **On-chain Verification**: Transparent, public verification
- **Cost-Efficient**: Much cheaper than traditional voting systems

## License

MIT

