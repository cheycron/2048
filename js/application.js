// Wait till the browser is ready to render the game (avoids glitches)
window.requestAnimationFrame(function () {
  // Initialize responsive helper
  if (typeof ResponsiveHelper !== 'undefined') {
    window.responsiveHelper = new ResponsiveHelper();
  }

  // Show mission briefing first time
  if (typeof MissionBriefing !== 'undefined') {
    new MissionBriefing();
  }

      var gameManager = new GameManager(4, KeyboardInputManager, HTMLActuator, LocalStorageManager);

  // Make gameManager globally accessible for subsystems
  window.gameManager = gameManager;

  // Initialize oxygen system (must be after gameManager for eventBus)
  if (typeof OxygenSystem !== 'undefined') {
    window.oxygenSystem = new OxygenSystem();
  }

  // Trigger initial progression update
  if (gameManager.eventBus) {
    var initialState = gameManager.getTileSum();
    gameManager.eventBus.emit('game:progression', {
      sum: initialState.sum,
      maxTile: initialState.maxTile,
      score: gameManager.score
    });
  }

  // Initialize debug overlay if ?debug=1 is in URL
  if (typeof DebugOverlay !== 'undefined') {
    new DebugOverlay(gameManager.visualEffects, gameManager);
  }
});
