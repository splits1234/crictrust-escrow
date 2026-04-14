// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title CricTrustEscrow
 * @notice Trustless escrow for the CricTrust freelance platform.
 *         Platform takes 2.5% from client on deposit + 2.5% from builder on payout.
 */
contract CricTrustEscrow {
    enum MatchStatus { TossWon, FirstInnings, DRS, MatchWon, MatchAbandoned }
    enum PSLTeam { LahoreQalandars, IslamabadUnited, KarachiKings, MultanSultans, PeshawarZalmi, QuettaGladiators }

    struct Match {
        address client;
        address builder;
        uint96 bounty;         // net bounty after client fee
        uint40 createdAt;
        uint40 deadline;
        MatchStatus status;
        PSLTeam team;
        uint8 complexityScore;
        bool scamDetected;
        bool builderConfirmed;
        bool clientApproved;
    }

    uint256 public nextMatchId = 1;
    mapping(uint256 => Match) public matches;
    mapping(uint256 => string) public matchTitles;
    mapping(uint256 => string) public matchDescriptions;
    mapping(address => uint256[]) public clientMatches;
    mapping(address => uint256[]) public builderMatches;

    address public umpire;
    uint256 public constant PLATFORM_FEE_BPS = 250;  // 2.5% from each side
    uint256 public constant SCAM_PENALTY_BPS = 500;   // 5%
    uint256 public platformEarnings;

    event MatchCreated(uint256 indexed id, address indexed client, uint256 bounty, uint256 platformFee);
    event BuilderAssigned(uint256 indexed id, address indexed builder);
    event InningsStarted(uint256 indexed id);
    event ComplexityScored(uint256 indexed id, uint8 score);
    event ScamDetected(uint256 indexed id, address indexed thief);
    event FundsReleased(uint256 indexed id, address indexed to, uint256 amount, uint256 platformFee);
    event MatchAbandoned(uint256 indexed id);
    event DRSRaised(uint256 indexed id, address indexed by);
    event PlatformWithdraw(address indexed to, uint256 amount);

    modifier onlyUmpire() {
        require(msg.sender == umpire, "Only umpire");
        _;
    }

    modifier exists(uint256 _id) {
        require(_id > 0 && _id < nextMatchId, "No such match");
        _;
    }

    constructor(address _umpire) {
        umpire = _umpire;
    }

    // ──────────────── Client creates match & deposits funds ────────────────
    // Client sends full amount. 2.5% is taken as platform fee, rest is the bounty.
    function createMatch(
        string calldata _title,
        string calldata _desc,
        uint40 _deadline,
        PSLTeam _team
    ) external payable returns (uint256) {
        require(msg.value > 0, "Must deposit bounty");
        require(_deadline > uint40(block.timestamp), "Deadline must be in the future");

        uint256 clientFee = (msg.value * PLATFORM_FEE_BPS) / 10000;
        uint256 netBounty = msg.value - clientFee;
        platformEarnings += clientFee;

        uint256 id = nextMatchId++;
        matches[id] = Match({
            client: msg.sender,
            builder: address(0),
            bounty: uint96(netBounty),
            createdAt: uint40(block.timestamp),
            deadline: _deadline,
            status: MatchStatus.TossWon,
            team: _team,
            complexityScore: 0,
            scamDetected: false,
            builderConfirmed: false,
            clientApproved: false
        });
        matchTitles[id] = _title;
        matchDescriptions[id] = _desc;
        clientMatches[msg.sender].push(id);

        emit MatchCreated(id, msg.sender, netBounty, clientFee);
        return id;
    }

    // ──────────────── Builder accepts match ────────────────
    function acceptMatch(uint256 _id) external exists(_id) {
        Match storage m = matches[_id];
        require(m.status == MatchStatus.TossWon, "Not open");
        require(m.builder == address(0), "Already assigned");
        require(msg.sender != m.client, "Client cannot be builder");

        m.builder = msg.sender;
        m.status = MatchStatus.FirstInnings;
        m.team = PSLTeam.IslamabadUnited;
        builderMatches[msg.sender].push(_id);

        emit BuilderAssigned(_id, msg.sender);
        emit InningsStarted(_id);
    }

    // ──────────────── Builder confirms delivery ────────────────
    function confirmDelivery(uint256 _id) external exists(_id) {
        Match storage m = matches[_id];
        require(msg.sender == m.builder, "Not builder");
        require(m.status == MatchStatus.FirstInnings, "Not in innings");

        m.builderConfirmed = true;
        m.team = PSLTeam.MultanSultans;
        _tryRelease(_id);
    }

    // ──────────────── Client approves delivery ────────────────
    // AI validation (complexityScore >= 40) is enforced in _tryRelease, not here.
    // Order of events no longer matters: client may approve before the umpire
    // has set a score, and funds auto-release as soon as all conditions are met.
    function approveDelivery(uint256 _id) external exists(_id) {
        Match storage m = matches[_id];
        require(msg.sender == m.client, "Not client");
        require(m.status == MatchStatus.FirstInnings, "Not in innings");

        m.clientApproved = true;
        _tryRelease(_id);
    }

    // ──────────────── Raise DRS (Dispute) ────────────────
    function raiseDRS(uint256 _id) external exists(_id) {
        Match storage m = matches[_id];
        require(msg.sender == m.client || msg.sender == m.builder, "Not participant");
        require(m.status == MatchStatus.FirstInnings, "Not in innings");

        m.status = MatchStatus.DRS;
        m.team = PSLTeam.QuettaGladiators;
        emit DRSRaised(_id, msg.sender);
    }

    // ──────────────── Umpire sets AI score ────────────────
    // If the builder has already confirmed and client already approved, setting a
    // passing score here will auto-release funds — so a late AI response can still
    // finalize a match without needing the client to re-submit approval.
    function setComplexityScore(uint256 _id, uint8 _score) external onlyUmpire exists(_id) {
        require(_score <= 100, "Max 100");
        Match storage m = matches[_id];
        require(m.status == MatchStatus.FirstInnings, "Not in innings");
        m.complexityScore = _score;
        emit ComplexityScored(_id, _score);
        _tryRelease(_id);
    }

    // ──────────────── Scam detection ────────────────
    function triggerScamDetection(uint256 _id) external onlyUmpire exists(_id) {
        Match storage m = matches[_id];
        require(m.status == MatchStatus.FirstInnings || m.status == MatchStatus.DRS, "Not active");
        require(m.builder != address(0), "No builder");

        m.scamDetected = true;
        m.status = MatchStatus.MatchWon;
        m.team = PSLTeam.PeshawarZalmi;

        uint256 bounty = uint256(m.bounty);
        uint256 penalty = (bounty * SCAM_PENALTY_BPS) / 10000;
        uint256 payout = bounty - penalty;
        platformEarnings += penalty;

        (bool ok, ) = m.builder.call{value: payout}("");
        require(ok, "Transfer failed");

        emit ScamDetected(_id, m.client);
        emit FundsReleased(_id, m.builder, payout, penalty);
    }

    // ──────────────── Refund client for bad code ────────────────
    function refundClientBadCode(uint256 _id) external onlyUmpire exists(_id) {
        Match storage m = matches[_id];
        require(m.status == MatchStatus.FirstInnings, "Not in innings");
        require(m.builder != address(0), "No builder");
        require(m.complexityScore < 40, "Code passed quality threshold");

        m.status = MatchStatus.MatchAbandoned;

        uint256 bounty = uint256(m.bounty);
        (bool ok, ) = m.client.call{value: bounty}("");
        require(ok, "Refund failed");

        emit FundsReleased(_id, m.client, bounty, 0);
        emit MatchAbandoned(_id);
    }

    // ──────────────── Resolve DRS ────────────────
    function resolveDRS(uint256 _id, bool _favorBuilder) external onlyUmpire exists(_id) {
        Match storage m = matches[_id];
        require(m.status == MatchStatus.DRS, "Not in DRS");

        uint256 bounty = uint256(m.bounty);
        if (_favorBuilder) {
            m.status = MatchStatus.MatchWon;
            m.team = PSLTeam.PeshawarZalmi;

            uint256 builderFee = (bounty * PLATFORM_FEE_BPS) / 10000;
            uint256 payout = bounty - builderFee;
            platformEarnings += builderFee;

            (bool ok, ) = m.builder.call{value: payout}("");
            require(ok, "Transfer failed");
            emit FundsReleased(_id, m.builder, payout, builderFee);
        } else {
            m.status = MatchStatus.MatchAbandoned;
            (bool ok, ) = m.client.call{value: bounty}("");
            require(ok, "Refund failed");
            emit FundsReleased(_id, m.client, bounty, 0);
            emit MatchAbandoned(_id);
        }
    }

    // ──────────────── Client abandons before builder assigned ────────────────
    function abandonMatch(uint256 _id) external exists(_id) {
        Match storage m = matches[_id];
        require(msg.sender == m.client, "Not client");
        require(m.status == MatchStatus.TossWon, "Builder already assigned");

        m.status = MatchStatus.MatchAbandoned;
        // Refund full bounty (client fee is NOT refunded)
        uint256 bounty = uint256(m.bounty);
        (bool ok, ) = m.client.call{value: bounty}("");
        require(ok, "Refund failed");

        emit MatchAbandoned(_id);
        emit FundsReleased(_id, m.client, bounty, 0);
    }

    // ──────────────── Internal: release funds to builder ────────────────
    // Takes 2.5% platform fee from builder's payout
    function _tryRelease(uint256 _id) internal {
        Match storage m = matches[_id];
        if (m.builderConfirmed && m.clientApproved && m.complexityScore >= 40) {
            m.status = MatchStatus.MatchWon;
            m.team = PSLTeam.PeshawarZalmi;

            uint256 bounty = uint256(m.bounty);
            uint256 builderFee = (bounty * PLATFORM_FEE_BPS) / 10000;
            uint256 payout = bounty - builderFee;
            platformEarnings += builderFee;

            (bool ok, ) = m.builder.call{value: payout}("");
            require(ok, "Transfer failed");
            emit FundsReleased(_id, m.builder, payout, builderFee);
        }
    }

    // ──────────────── Umpire withdraws platform earnings ────────────────
    function withdrawPlatformFees() external onlyUmpire {
        uint256 amount = platformEarnings;
        require(amount > 0, "No fees to withdraw");
        platformEarnings = 0;

        (bool ok, ) = umpire.call{value: amount}("");
        require(ok, "Withdraw failed");
        emit PlatformWithdraw(umpire, amount);
    }

    // ──────────────── View functions ────────────────
    function getMatch(uint256 _id) external view returns (Match memory) {
        return matches[_id];
    }

    function getClientMatches(address _client) external view returns (uint256[] memory) {
        return clientMatches[_client];
    }

    function getBuilderMatches(address _builder) external view returns (uint256[] memory) {
        return builderMatches[_builder];
    }

    receive() external payable {}
}
