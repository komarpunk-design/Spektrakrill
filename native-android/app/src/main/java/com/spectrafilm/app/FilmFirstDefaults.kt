/* Stock-first workflow; defaults are explicit UI actions, never preset migrations. GPLv3. */
package com.spectrafilm.app

import android.content.Context

internal fun ParamsState.applyFilmFirstDefaults(ctx:Context,id:String,fresh:Boolean=false) {
    LabCatalog.initialize(ctx)
    val stock=LabCatalog.stock(id)
    filmProfile=id
    resetStockCharacter(print=false)
    val next=labObject()
    for(key in next.keys().asSequence().toList())if(key.startsWith("grain")||key.startsWith("dir")||key=="layeredTransport"||key in listOf("filmChemistry","filmFast","filmSlow","filmRed","filmGreen","filmBlue","filmExhaustion","filmBaseActive","filmBaseScale","filmBaseTilt","filmBaseCyan","filmBaseMagenta","filmBaseYellow"))next.remove(key)
    labJson=next.toString()
    applyLabStock(id)
    setLab("spectralMethod","arctic2026beta04")
    setLab("layeredTransport.model","layered")
    grainActive=true;halationActive=true;couplersActive=true
    val mono=stock?.optBoolean("monochrome")==true||SilverPrint.isSilverFilm(id)
    val slide=stock?.optString("type")=="positive"||StockCatalog.isReversalFilm(ctx,id)
    if(mono){couplersActive=false;setLab("dirLangmuir",false)}
    // Changing material must not reset paper, scanner calibration or the selected route.
    // The engine already bypasses color-negative receivers for monochrome and slides.
    if(fresh) {
        if(mono||slide)clearScanValues(NORITSU_JOB_KEYS)
        if(slide){setLab("outputModel.mode","paper");scanFilm=true}
        else if(mono)chooseScanReceiver("digital")
        else useBuiltinFactoryNoritsuJob()
    }
}

internal fun ParamsState.resetPrintStockCharacter() {
    resetStockCharacter(film=false)
    val d=PARAM_DEFAULTS
    morphActive=d.morphActive;morphGammaFactor=d.morphGammaFactor
    morphGammaFactorFast=d.morphGammaFactorFast;morphGammaFactorSlow=d.morphGammaFactorSlow
    morphGammaFactorRed=d.morphGammaFactorRed;morphGammaFactorGreen=d.morphGammaFactorGreen;morphGammaFactorBlue=d.morphGammaFactorBlue
    morphDeveloperExhaustion=d.morphDeveloperExhaustion
    val next=labObject()
    for(key in next.keys().asSequence().toList())if(key.startsWith("printBase")||key in listOf("printChemistry","printFast","printSlow","printRed","printGreen","printBlue","printExhaustion","printGamma"))next.remove(key)
    labJson=next.toString()
}
