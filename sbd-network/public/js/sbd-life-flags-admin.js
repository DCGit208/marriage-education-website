/**
 * Admin — toggle SBD Life production flags (admin/flags).
 */
(function () {
  var enableBtn = document.getElementById('enableProductionBtn');
  var disableBtn = document.getElementById('disableProductionBtn');
  var status = document.getElementById('productionFlagStatus');
  if (!enableBtn && !disableBtn) return;

  function setStatus(msg) {
    if (status) status.textContent = msg;
  }

  async function updateFlags(patch) {
    var ctx = await window.SbdLifeData.getViewerContext();
    if (!ctx.isAdmin) {
      setStatus('Admin required.');
      return;
    }
    await firebase
      .firestore()
      .collection('admin')
      .doc('flags')
      .set(
        Object.assign({ updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, patch),
        { merge: true }
      );
    var snap = await firebase.firestore().collection('admin').doc('flags').get();
    var d = snap.data() || {};
    setStatus(
      'Flags updated — sbdLifeEnabled: ' +
        Boolean(d.sbdLifeEnabled) +
        ', sbdLifeLabsEnabled: ' +
        Boolean(d.sbdLifeLabsEnabled)
    );
  }

  if (enableBtn) {
    enableBtn.addEventListener('click', async function () {
      enableBtn.disabled = true;
      setStatus('Enabling production rollout…');
      try {
        await updateFlags({ sbdLifeEnabled: true, sbdLifeLabsEnabled: true });
      } catch (err) {
        setStatus('Failed: ' + (err.message || err.code));
      }
      enableBtn.disabled = false;
    });
  }

  if (disableBtn) {
    disableBtn.addEventListener('click', async function () {
      disableBtn.disabled = true;
      setStatus('Disabling production rollout…');
      try {
        await updateFlags({ sbdLifeEnabled: false });
      } catch (err) {
        setStatus('Failed: ' + (err.message || err.code));
      }
      disableBtn.disabled = false;
    });
  }

  firebase.auth().onAuthStateChanged(async function (user) {
    if (!user || !status) return;
    try {
      var snap = await firebase.firestore().collection('admin').doc('flags').get();
      var d = snap.exists ? snap.data() : {};
      setStatus(
        'Current — sbdLifeEnabled: ' +
          Boolean(d.sbdLifeEnabled) +
          ', sbdLifeLabsEnabled: ' +
          Boolean(d.sbdLifeLabsEnabled)
      );
    } catch (err) {
      setStatus('Could not read flags.');
    }
  });
})();
