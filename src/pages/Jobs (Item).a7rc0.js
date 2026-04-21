// Velo API Reference: https://www.wix.com/velo/reference/api-overview/introduction

$w.onReady(function () {
	$w("#dynamicDataset").onReady(() => {
		const currentJob = $w('#dynamicDataset').getCurrentItem()
		$w("#form2").setFieldValues({job: `${currentJob.title} - ${currentJob.address.formatted} - ${currentJob._id}`})
	})
});