/**
 * Mission Briefing - Story introduction overlay
 * Shows the lore and mission objectives before game starts
 */

function MissionBriefing() {
  this.shown = localStorage.getItem('missionBriefingShown') === 'true';
  this.overlay = null;

  if (!this.shown) {
    this.show();
  }
}

MissionBriefing.prototype.show = function() {
  var self = this;

  // Create overlay
  this.overlay = document.createElement('div');
  this.overlay.id = 'mission-briefing';
  this.overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.92); z-index: 9999; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(20px); animation: fadeIn 0.4s ease; padding: 20px; box-sizing: border-box; overflow-y: auto;';

  var content = document.createElement('div');
  content.style.cssText = 'max-width: min(550px, 100%); width: 100%; padding: clamp(24px, 5vw, 40px); background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 16px; color: #fff; font-family: "Outfit", -apple-system, BlinkMacSystemFont, sans-serif; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 80px rgba(59, 130, 246, 0.2); animation: slideUp 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); backdrop-filter: blur(12px);';

  content.innerHTML = '<div style="text-align: center; margin-bottom: clamp(20px, 5vh, 32px);">' +
    '<div style="font-size: clamp(40px, 10vw, 56px); margin-bottom: 12px; filter: drop-shadow(0 0 20px rgba(59, 130, 246, 0.5));">🛰️</div>' +
    '<h1 style="margin: 0; font-size: clamp(24px, 6vw, 36px); font-weight: 700; background: linear-gradient(135deg, #60a5fa, #3b82f6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; letter-spacing: 2px;">MISSION CRITICAL</h1>' +
    '<div style="font-size: clamp(10px, 2.5vw, 12px); color: rgba(255, 255, 255, 0.5); margin-top: 8px; letter-spacing: 2px; text-transform: uppercase;">Cálculo de Reentrada</div>' +
    '</div>' +
    '<div style="background: rgba(0, 0, 0, 0.25); padding: clamp(16px, 4vw, 24px); border-left: 3px solid #3b82f6; margin-bottom: clamp(20px, 4vh, 28px); line-height: 1.7; font-size: clamp(13px, 3vw, 15px); border-radius: 0 8px 8px 0;">' +
    '<p style="margin: 0 0 16px 0;">Eres el <strong style="color: #60a5fa;">oficial de navegación</strong> de la estación espacial <strong style="color: #f59e0b;">2048</strong>, en órbita a 400km sobre la Tierra.</p>' +
    '<p style="margin: 0 0 16px 0;">Una <strong style="color: #f43f5e;">tormenta solar geomagnética de clase X</strong> ha destruido todos los sistemas de computación. La tripulación tiene oxígeno para <strong style="color: #f43f5e;">48 horas</strong>.</p>' +
    '<p style="margin: 0;">Debes calcular la <strong style="color: #10b981;">secuencia de reentrada</strong>. Cada número representa un vector en m/s.</p>' +
    '</div>' +
    '<div style="background: linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(59, 130, 246, 0.15)); padding: clamp(16px, 4vw, 24px); border-radius: 12px; margin-bottom: clamp(20px, 4vh, 28px); border: 1px solid rgba(59, 130, 246, 0.25);">' +
    '<div style="font-size: clamp(10px, 2.5vw, 11px); color: rgba(255, 255, 255, 0.5); text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;"><span style="font-size: 14px;">🎯</span> Objetivo</div>' +
    '<div style="font-size: clamp(16px, 4vw, 20px); font-weight: 700; color: #f59e0b; margin-bottom: 8px;">Vector 2048 m/s</div>' +
    '<div style="font-size: clamp(11px, 2.8vw, 13px); color: rgba(255, 255, 255, 0.6);">Aterrizaje seguro en el Océano Pacífico</div>' +
    '</div>' +
    '<div style="text-align: center; font-size: clamp(12px, 3vw, 14px); color: rgba(255, 255, 255, 0.4); margin-bottom: clamp(24px, 5vh, 32px); font-style: italic; padding: 0 16px;">' +
    '"El tiempo corre. La atmósfera te espera."' +
    '</div>' +
    '<div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">' +
    '<button id="start-mission" class="mission-btn-primary" style="flex: 1; min-width: 140px; padding: clamp(12px, 3vw, 16px) clamp(20px, 5vw, 32px); background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; border: none; border-radius: 10px; font-family: inherit; font-size: clamp(14px, 3.5vw, 16px); font-weight: 600; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 4px 20px rgba(59, 130, 246, 0.35); letter-spacing: 0.5px;">🚀 Iniciar Misión</button>' +
    '<button id="skip-briefing" class="mission-btn-secondary" style="padding: clamp(12px, 3vw, 16px) clamp(16px, 4vw, 24px); background: rgba(255, 255, 255, 0.05); color: rgba(255, 255, 255, 0.6); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 10px; font-family: inherit; font-size: clamp(13px, 3vw, 14px); font-weight: 500; cursor: pointer; transition: all 0.2s ease;">Omitir</button>' +
    '</div>' +
    '<div style="text-align: center; margin-top: clamp(16px, 4vh, 24px);">' +
    '<label style="font-size: clamp(11px, 2.8vw, 12px); color: rgba(255, 255, 255, 0.4); cursor: pointer; display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 6px; transition: all 0.2s ease;" onmouseover="this.style.background=\'rgba(255,255,255,0.05)\'" onmouseout="this.style.background=\'transparent\'">' +
    '<input type="checkbox" id="dont-show-again" style="cursor: pointer; width: 16px; height: 16px; accent-color: #3b82f6;">' +
    '<span>No volver a mostrar</span>' +
    '</label>' +
    '</div>';

  this.overlay.appendChild(content);
  document.body.appendChild(this.overlay);

  // Add CSS animations
  var style = document.createElement('style');
  style.textContent = '@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }' +
    '@keyframes slideUp { from { transform: translateY(40px) scale(0.95); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }' +
    '@keyframes fadeOut { from { opacity: 1; } to { opacity: 0; transform: scale(0.95); } }' +
    '.mission-btn-primary:hover { transform: translateY(-2px) scale(1.02); box-shadow: 0 6px 25px rgba(59, 130, 246, 0.5) !important; }' +
    '.mission-btn-primary:active { transform: translateY(0) scale(0.98); }' +
    '.mission-btn-secondary:hover { background: rgba(255, 255, 255, 0.1) !important; color: rgba(255, 255, 255, 0.9) !important; border-color: rgba(255, 255, 255, 0.3) !important; }' +
    '.mission-btn-secondary:active { transform: scale(0.95); }' +
    '@media (max-width: 600px) { #mission-briefing > div { max-height: 90vh; overflow-y: auto; } }';
  document.head.appendChild(style);

  // Event listeners
  document.getElementById('start-mission').addEventListener('click', function() {
    self.close(true);
  });

  document.getElementById('skip-briefing').addEventListener('click', function() {
    self.close(false);
  });
};

MissionBriefing.prototype.close = function(playSound) {
  var dontShow = document.getElementById('dont-show-again');
  if (dontShow && dontShow.checked) {
    localStorage.setItem('missionBriefingShown', 'true');
  }

  var self = this;
  if (this.overlay) {
    // Smooth fade out animation
    this.overlay.style.animation = 'fadeOut 0.25s ease-out';

    setTimeout(function() {
      if (self.overlay && self.overlay.parentNode) {
        self.overlay.parentNode.removeChild(self.overlay);
      }
      self.overlay = null;
    }, 250);
  }
};

// Add reset function for testing
MissionBriefing.reset = function() {
  localStorage.removeItem('missionBriefingShown');
  console.log('Mission briefing reset. Reload page to see it again.');
};
